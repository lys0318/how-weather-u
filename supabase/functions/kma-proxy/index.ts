// 기상청(KMA) 단기예보 API 프록시
//
// 왜 서버를 거치나:
// 1) 앱(React Native)에서 직접 호출하면 data.go.kr 게이트웨이가 HTTP 400
//    INVALID_REQUEST_PARAMETER_ERROR로 거부한다. 같은 URL이 PC·폰 브라우저에선
//    정상 응답하므로 URL·파라미터·키는 무죄이고, RN 전송 계층 문제로 좁혀졌다.
//    서버에서 부르면 이 계층 자체가 관여하지 않는다.
// 2) 키가 클라이언트 번들에서 빠진다. EXPO_PUBLIC_ 키는 앱을 뜯으면 추출 가능해
//    남이 우리 일일 쿼터를 소진시킬 수 있었다.
// 3) 격자·발표시각 단위 캐시로 쿼터를 아낀다(같은 동네 사용자끼리 공유).
//
// 환경변수: KMA_API_KEY (Supabase secret)

import { corsHeaders } from '../_shared/cors.ts';

const BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const KMA_KEY = Deno.env.get('KMA_API_KEY') ?? '';

// 임의 주소를 대신 호출해주는 오픈 프록시가 되지 않도록 화이트리스트로 제한
const ALLOWED_ENDPOINTS = new Set(['getUltraSrtNcst', 'getVilageFcst']);

const UPSTREAM_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

interface KmaItem {
  category: string;
  obsrValue?: string;
  fcstValue?: string;
  fcstDate?: string;
  fcstTime?: string;
}
interface Payload {
  items: KmaItem[];
  totalCount: number;
}

// 인스턴스 수명 동안만 유지되는 캐시. 영속 저장소를 붙일 만큼의 가치는 없고,
// 백그라운드 갱신이 시간당 1회라 이 정도로도 상당수를 흡수한다.
const cache = new Map<string, { at: number; payload: Payload }>();

function cacheGet(key: string): Payload | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key: string, payload: Payload): void {
  // 오래된 것부터 정리 (Map은 삽입 순서를 유지)
  if (cache.size >= CACHE_MAX) {
    for (const k of cache.keys()) {
      cache.delete(k);
      if (cache.size < CACHE_MAX) break;
    }
  }
  cache.set(key, { at: Date.now(), payload });
}

function bad(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** 요청 본문 검증. 통과하면 upstream에 넘길 파라미터를 돌려준다. */
function validate(body: Record<string, unknown>): { endpoint: string; params: Record<string, string> } | string {
  const endpoint = String(body.endpoint ?? '');
  if (!ALLOWED_ENDPOINTS.has(endpoint)) return `허용되지 않은 endpoint: ${endpoint}`;

  const base_date = String(body.base_date ?? '');
  if (!/^\d{8}$/.test(base_date)) return 'base_date 형식 오류(YYYYMMDD)';

  const base_time = String(body.base_time ?? '');
  if (!/^\d{4}$/.test(base_time)) return 'base_time 형식 오류(HHmm)';

  // 기상청 격자 범위. 벗어난 값은 upstream에 보내기 전에 거른다.
  const nx = Number(body.nx);
  const ny = Number(body.ny);
  if (!Number.isInteger(nx) || nx < 1 || nx > 200) return `nx 범위 오류: ${body.nx}`;
  if (!Number.isInteger(ny) || ny < 1 || ny > 200) return `ny 범위 오류: ${body.ny}`;

  const numOfRows = Number(body.numOfRows ?? 1000);
  if (!Number.isInteger(numOfRows) || numOfRows < 1 || numOfRows > 2000) return `numOfRows 범위 오류: ${body.numOfRows}`;

  const pageNo = Number(body.pageNo ?? 1);
  if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > 10) return `pageNo 범위 오류: ${body.pageNo}`;

  return {
    endpoint,
    params: {
      base_date,
      base_time,
      nx: String(nx),
      ny: String(ny),
      numOfRows: String(numOfRows),
      pageNo: String(pageNo),
    },
  };
}

async function fetchUpstream(endpoint: string, params: Record<string, string>): Promise<Payload> {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${BASE}/${endpoint}?serviceKey=${KMA_KEY}&dataType=JSON&${qs}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }

  // 본문은 한 번만 읽는다. data.go.kr은 오류 시 JSON이 아닌 형식으로 사유를 담아 보낸다.
  const text = await res.text();
  if (!res.ok) throw new Error(`upstream http ${res.status} ${excerpt(text)}`);

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`upstream non-json ${excerpt(text)}`);
  }

  const code = json?.response?.header?.resultCode;
  if (code !== '00') {
    throw new Error(`upstream resultCode ${code} (${json?.response?.header?.resultMsg ?? '?'})`);
  }

  const items = json?.response?.body?.items?.item;
  if (!Array.isArray(items)) throw new Error('upstream items missing');

  const totalCount = Number(json?.response?.body?.totalCount ?? items.length);
  return { items, totalCount: Number.isNaN(totalCount) ? items.length : totalCount };
}

/** 오류 본문 요약 — 태그 제거 후 앞부분만. 키가 섞여 되돌아오는 경우 제거. */
function excerpt(text: string): string {
  const clean = text
    .replace(/(serviceKey|authKey)=[^&\s]*/gi, '$1=***')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean ? `«${clean.slice(0, 200)}»` : '«empty body»';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (!KMA_KEY) return bad('KMA_API_KEY 미설정', 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('JSON 본문이 필요합니다');
  }

  const checked = validate(body);
  if (typeof checked === 'string') return bad(checked);

  const cacheKey = `${checked.endpoint}:${Object.values(checked.params).join(':')}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return new Response(JSON.stringify({ ...cached, cached: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = await fetchUpstream(checked.endpoint, checked.params);
    cacheSet(cacheKey, payload);
    return new Response(JSON.stringify({ ...payload, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // 실패 사유를 그대로 돌려줘 클라이언트가 기존처럼 분류·리포트할 수 있게 한다.
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
