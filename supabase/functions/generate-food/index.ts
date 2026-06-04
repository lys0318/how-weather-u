// 날씨 기반 음식 추천 Edge Function

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/claude.ts';
import { requireUser, checkAndLog, limitExceededResponse } from '../_shared/limit.ts';
import { getKstContext } from '../_shared/datetime.ts';

const SYSTEM_PROMPT = `당신은 한국의 날씨에 어울리는 음식을 맛깔나게 추천해주는 친한 친구입니다.

규칙:
- 현재 날씨, 기온, 시간대, 요일, 계절(제철)을 모두 반영하세요
- 한국인 정서에 맞는 음식 위주로 추천하세요 (한식 우선, 분식·양식·중식·일식·아시안·디저트·음료도 폭넓게 가능)
- 음식 1가지를 콕 집어서 추천하세요
- 친근하고 다정한 친구 말투로 ("~ 어떠세요?", "~ 어때요?")
- 2~3문장, 그 이상 쓰지 마세요 (길이는 짧게 유지)
- 마지막에 어울리는 이모지 1~2개를 붙여주세요
- 설명 없이 추천만 출력하세요

★ 퀄리티 — 침이 고이게 만드세요:
- 메뉴 이름만 던지지 말고, 식감·온도·향·한 입의 순간을 생생하게 묘사하세요.
  (예: "보글보글 끓는", "바삭하게 부친", "김 모락모락", "한 입 베어 물면")
- 가능하면 제철 재료/계절 별미를 살리세요 (봄 냉이·달래, 여름 콩국수·초당옥수수, 가을 전어·대하, 겨울 방어·굴 등).
- 요일 분위기도 슬쩍 (금요일 저녁엔 한 주 마무리, 월요일엔 기운 나는 한 끼 식으로).

★ 다양성:
- 라면·국물요리만 반복하지 마세요. 매번 다른 메뉴를 신선하게.
- 국·찌개·면·밥·구이·볶음·튀김·전·분식·디저트·음료 등 폭넓은 카테고리에서.

예시(분위기 참고용, 그대로 베끼지 말 것):
- 비 오는 저녁: "이렇게 비 오는 저녁엔 기름 두른 팬에 바삭하게 부친 해물파전 어때요? 가장자리 노릇한 부분 떼어 막걸리 한 모금이면 빗소리마저 안주가 돼요 🥞🍶"
- 더운 한낮: "푹푹 찌는 오늘은 살얼음 동동 띄운 콩국수 어떠세요? 고소한 국물 한 입에 더위가 쑥 내려갈 거예요 🍜❄️"`;

interface ForecastSlot {
  hour: number;
  conditionKo: string;
  temp: number;
  popPercent: number;
}

interface RequestBody {
  conditionKo: string;
  timeOfDayKo: string;
  hour: number;
  temp: number;
  tempMin: number;
  tempMax: number;
  forecast?: ForecastSlot[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await requireUser(req);
    const usage = await checkAndLog(user.id, 'food');
    if (!usage.ok) {
      return limitExceededResponse(usage.used, usage.limit, corsHeaders);
    }

    const body = (await req.json()) as RequestBody;

    if (!body.conditionKo || body.temp === undefined) {
      return new Response(
        JSON.stringify({ error: '필수 입력값 누락' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const mealHint =
      body.hour >= 6 && body.hour < 10
        ? '아침 식사'
        : body.hour >= 10 && body.hour < 14
        ? '점심 식사'
        : body.hour >= 14 && body.hour < 17
        ? '간식 / 늦은 점심'
        : body.hour >= 17 && body.hour < 21
        ? '저녁 식사'
        : '야식 / 늦은 시간';

    // 향후 예보 (예: 이따 비 올 예정 → 따뜻한 국물요리)
    let forecastBlock = '';
    if (body.forecast && body.forecast.length > 0) {
      const lines = body.forecast.map(
        (f) => `  · ${f.hour}시: ${f.conditionKo}, ${f.temp}°C, 강수확률 ${f.popPercent}%`,
      );
      forecastBlock = `\n향후 12시간 예보 (3시간 간격):\n${lines.join('\n')}`;
    }

    // 다양성 변주 — 매 호출마다 랜덤 카테고리를 살짝 제시해 반복(라면 등) 방지
    const CUISINE_POOL = [
      '국·탕·찌개류', '면요리', '밥·덮밥·볶음밥', '구이·고기류', '분식',
      '볶음요리', '전·부침류', '양식', '중식', '일식', '아시안 음식',
      '죽·수프류', '샐러드·가벼운 식사', '디저트·간식', '따뜻한 음료·차',
    ];
    const pick = CUISINE_POOL[Math.floor(Math.random() * CUISINE_POOL.length)];

    const kst = getKstContext();

    const userPrompt = `현재 상황:
- 요일: ${kst.weekday}요일${kst.isWeekend ? ' (주말)' : ''}
- 계절: ${kst.season} (${kst.seasonHint})
- 시간대: ${body.timeOfDayKo} (${body.hour}시) — ${mealHint}
- 날씨: ${body.conditionKo}
- 현재 기온: ${body.temp}°C
- 오늘 최저/최고: ${body.tempMin}°C / ${body.tempMax}°C${forecastBlock}

이 상황에 딱 어울리는 음식 1가지를 침이 고이게 묘사해서 추천해주세요.
- 향후 예보가 있으면 반영하세요 (예: 이따 비 올 예정이면 따뜻한 국물요리).
- 제철 재료를 살리면 좋아요. 요일 분위기도 슬쩍 녹여도 좋고요.
- 이번엔 가능하면 '${pick}' 계열에서 떠올려보세요. 단, 지금 날씨/시간과 영 안 맞으면 다른 계열로 자유롭게 바꿔도 좋아요.
- 라면처럼 뻔한 선택은 피하고 신선한 메뉴로요. (2~3문장)`;

    const { text } = await callClaude({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 250,
      temperature: 1,
    });

    return new Response(
      JSON.stringify({ text, used: usage.used, limit: usage.limit }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
