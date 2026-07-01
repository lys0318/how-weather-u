# T4 — 운세 서비스 신설 (Haiku)

**의존 태스크**: T3(MessagingScreen 존재)
**영향 받는 태스크**: T6(i18n 문구)

## 목표

날씨 기반 운세 기능 추가.
- 엣지함수: `generate-fortune` (Haiku, `generate-activity` 구조 복제)
- 클라이언트: `fortune.ts` 서비스 + `useFortune.ts` 훅
- MessagingScreen에 운세 카드 추가
- `_shared/limit.ts`에 이미 `'fortune'` Feature가 T5에서 추가됨

---

## 신규 파일 1: `supabase/functions/generate-fortune/index.ts`

`generate-activity/index.ts`를 기반으로 복제 후 프롬프트만 변경.

```typescript
// 날씨 기반 운세 Edge Function (ko/en, Haiku)

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude, MODEL_HAIKU } from '../_shared/claude.ts';
import { requireUser, checkAndLog, limitExceededResponse } from '../_shared/limit.ts';
import { getKstContext } from '../_shared/datetime.ts';
import { Lang, conditionLabel, timeOfDayLabel } from '../_shared/labels.ts';

const SYSTEM_PROMPT_KO = `당신은 오늘의 날씨에서 영감을 받아 따뜻한 운세를 전해주는 친구입니다.

규칙:
- 날씨, 기온, 요일, 시간대를 바탕으로 오늘의 운세를 1~2문장으로 써주세요
- 신비롭고 따뜻한 말투로, 부드럽게 희망을 전하는 느낌
- 날씨 현상을 비유나 상징으로 활용하세요
- 구체적인 날씨 사실을 나열하지 말고, 운세답게 써주세요
- 마지막에 어울리는 이모지 1개
- 설명 없이 운세 내용만 출력하세요`;

const SYSTEM_PROMPT_EN = `You are a friend who channels today's weather into a warm fortune.

Rules:
- Write 1-2 sentences of today's fortune, inspired by the weather, temperature, day, and time
- Warm, slightly mystical tone — gently hopeful
- Use weather as metaphor or symbol, not as a list of facts
- End with 1 fitting emoji
- Output only the fortune, no explanations
- Write in natural English`;

interface RequestBody {
  condition?: string;
  timeOfDay?: string;
  hour: number;
  temp: number;
  lang?: Lang;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    const usage = await checkAndLog(user.id, 'fortune');
    if (!usage.ok) return limitExceededResponse(usage.used, usage.limit, corsHeaders);

    const body = (await req.json()) as RequestBody;
    if (!body.condition || body.temp === undefined) {
      return new Response(JSON.stringify({ error: 'missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lang: Lang = body.lang === 'en' ? 'en' : 'ko';
    const kst = getKstContext(lang);
    const condText = conditionLabel(lang, body.condition);
    const todText = body.timeOfDay ? timeOfDayLabel(lang, body.timeOfDay) : '';

    const userPrompt = lang === 'ko'
      ? `오늘 운세를 써주세요.\n- 요일: ${kst.weekday}요일\n- 계절: ${kst.season}\n- 시간대: ${todText}(${body.hour}시)\n- 날씨: ${condText}, ${body.temp}°C`
      : `Write today's fortune.\n- Day: ${kst.weekday}\n- Season: ${kst.season}\n- Time: ${todText} (${body.hour}:00)\n- Weather: ${condText}, ${body.temp}°C`;

    const { text } = await callClaude({
      systemPrompt: lang === 'ko' ? SYSTEM_PROMPT_KO : SYSTEM_PROMPT_EN,
      userPrompt,
      maxTokens: 120,
      temperature: 1,
      model: MODEL_HAIKU,
    });

    return new Response(
      JSON.stringify({ text, used: usage.used, limit: usage.limit }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

---

## 신규 파일 2: `src/services/fortune.ts`

`src/services/activity.ts`를 기반으로 복제.

```typescript
// 운세 생성 서비스 — generate-fortune Edge Function 래퍼
import { supabase } from '../lib/supabase';
import { WeatherInfo, getTimeOfDay } from '../constants/weather';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export interface FortuneResult {
  text: string;
  used: number;
  limit: number;
}

export async function generateFortune(
  weather: WeatherInfo,
  lang: 'ko' | 'en' = 'ko',
): Promise<FortuneResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('환경변수 누락');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('로그인이 필요합니다.');

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = getTimeOfDay(hour);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-fortune`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      condition: weather.condition,
      timeOfDay,
      hour,
      temp: weather.temp,
      lang,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
```

---

## 신규 파일 3: `src/hooks/useFortune.ts`

`src/hooks/useActivity.ts`를 기반으로 복제.

```typescript
import { useState, useCallback } from 'react';
import { WeatherInfo } from '../constants/weather';
import { generateFortune } from '../services/fortune';
import { runWithGate } from './useGenerationGate';
import { useI18n } from '../i18n';

export function useFortune(weather: WeatherInfo | null) {
  const { language } = useI18n();
  const [fortune, setFortune] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFortune = useCallback(async () => {
    if (!weather) return;
    setLoading(true);
    setError(null);
    await runWithGate(async () => {
      try {
        const result = await generateFortune(weather, language as 'ko' | 'en');
        setFortune(result.text);
      } catch (e) {
        setError(e instanceof Error ? e.message : '오류 발생');
      } finally {
        setLoading(false);
      }
    });
    setLoading(false);
  }, [weather, language]);

  return { fortune, loadFortune, loading, error };
}
```

---

## MessagingScreen.tsx 수정

T3에서 주석 처리해둔 운세 섹션 활성화:

```typescript
import { useFortune } from '../hooks/useFortune';

// MessagingScreen 내부:
const { fortune, loadFortune, loading: fortuneLoading } = useFortune(weather);

// JSX에 추가 (음식 추천 아래):
<View style={styles.section}>
  <Text style={styles.sectionTitle}>{'오늘의 운세'}</Text>
  <TouchableOpacity style={styles.genBtn} onPress={loadFortune} disabled={fortuneLoading}>
    <Text style={styles.genBtnText}>{fortuneLoading ? '생성 중...' : '운세 보기'}</Text>
  </TouchableOpacity>
  {fortune && <Text style={styles.result}>{fortune}</Text>}
</View>
```

---

## 엣지함수 배포 (Supabase MCP로 배포)

배포 대상:
1. `generate-fortune` (신규)
2. `generate-activity` (MODEL_HAIKU 전환, T5에서 수정)
3. `generate-food` (MODEL_HAIKU 전환, T5에서 수정)
4. `_shared/limit.ts` 의존 함수들 전체 재배포

> **참고**: 엣지함수 배포는 `SUPABASE_ACCESS_TOKEN` 필요 → Supabase MCP가 있으면 사용,
> 없으면 사용자에게 배포 요청.

---

## 완료 기준

- `npx tsc --noEmit` 오류 없음
- MessagingScreen에 운세 버튼 + 결과 표시
- `generate-fortune` 엣지함수 로컬 코드 완성
- `usage_log.feature`가 `'fortune'`을 받아들이는지 확인 (T5의 `_shared/limit.ts` 수정에 의존)
