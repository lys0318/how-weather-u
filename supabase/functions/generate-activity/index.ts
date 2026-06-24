// 날씨 기반 활동 추천 Edge Function (ko/en)

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/claude.ts';
import { requireUser, checkAndLog, limitExceededResponse } from '../_shared/limit.ts';
import { getKstContext } from '../_shared/datetime.ts';
import { Lang, conditionLabel, timeOfDayLabel, metricLines } from '../_shared/labels.ts';

const SYSTEM_PROMPT_KO = `당신은 날씨에 어울리는 활동을 제안해주는 친한 친구입니다.

규칙:
- 현재 날씨, 기온, 시간대, 요일에 어울리는 구체적인 활동을 1가지 제안하세요
- **향후 예보(강수 확률, 날씨 변화)도 적극 반영**하세요
- **자외선·미세먼지·강수량도 반영**하세요
  · 자외선이 높으면 모자·선크림이나 그늘/실내 활동을 슬쩍
  · 미세먼지가 나쁘면 실내 활동 위주로
  · 비가 오거나 올 예정이면 실내 또는 비 그친 뒤로
- 친근하고 다정한 말투로, 친구가 권유하듯이 써주세요
- 2~3문장, 그 이상 쓰지 마세요 (길이는 짧게)
- 마지막에 어울리는 이모지 1~2개를 붙여주세요
- 설명 없이 추천 내용만 출력하세요

★ 퀄리티 — 장면이 그려지게 하세요:
- 활동 이름만 던지지 말고, 그 순간의 감각·기분을 생생하게 묘사하세요.
- 요일·시간 맥락을 살리세요.

★ 다양성:
- 독서·산책만 반복하지 마세요. 운동·취미·문화·요리·휴식·기록 등 폭넓게.`;

const SYSTEM_PROMPT_EN = `You are a close friend who suggests an activity that fits the weather.

Rules:
- Suggest ONE concrete activity that fits the current weather, temperature, time of day, and day of week
- **Actively reflect the forecast** (rain chance, changing weather)
- **Also reflect UV, air quality, and rainfall**
  · High UV → gently suggest a hat/sunscreen, or shade/indoor activity
  · Bad air quality → lean toward indoor activities
  · Raining or rain coming → indoor, or after the rain clears
- Warm, friendly tone, like a friend suggesting it
- 2-3 sentences, no more (keep it short)
- End with 1-2 fitting emojis
- Output only the recommendation, no explanations
- Write in natural English

★ Quality — paint the scene:
- Don't just name an activity; vividly describe the sensation and mood of the moment.
- Honor the day/time context (weekday vs weekend, after work, etc.).

★ Variety:
- Don't keep repeating reading/walking. Range across exercise, hobbies, culture, cooking, rest, journaling, etc.`;

interface ForecastSlot {
  hour: number;
  condition?: string;
  temp: number;
  popPercent: number;
}

interface RequestBody {
  condition?: string;
  timeOfDay?: string;
  hour: number;
  temp: number;
  tempMin: number;
  tempMax: number;
  forecast?: ForecastSlot[];
  uvIndex?: number;
  pm10?: number;
  pm25?: number;
  rainfall?: number;
  lang?: Lang;
}

function fcLabel(lang: Lang, f: ForecastSlot): string {
  return f.condition ? conditionLabel(lang, f.condition) : '';
}

const ACTIVITY_POOL: Record<Lang, string[]> = {
  ko: [
    '가벼운 운동·산책', '집에서 하는 취미', '카페·휴식', '문화생활(영화·전시·음악)',
    '독서·글쓰기', '요리·베이킹', '친구·가족과 함께하는 일', '자기계발·공부',
    '정리·청소', '사진 찍기·기록', '명상·스트레칭', '새로운 곳 탐방',
  ],
  en: [
    'light exercise / a walk', 'a hobby at home', 'cafe / rest', 'culture (film, exhibit, music)',
    'reading / writing', 'cooking / baking', 'time with friends or family', 'self-improvement / study',
    'tidying / cleaning', 'photography / journaling', 'meditation / stretching', 'exploring somewhere new',
  ],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await requireUser(req);
    const usage = await checkAndLog(user.id, 'activity');
    if (!usage.ok) {
      return limitExceededResponse(usage.used, usage.limit, corsHeaders);
    }

    const body = (await req.json()) as RequestBody;

    if (!body.condition || body.temp === undefined) {
      return new Response(
        JSON.stringify({ error: 'missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const lang: Lang = body.lang === 'en' ? 'en' : 'ko';
    const kst = getKstContext(lang);
    const metrics = metricLines(lang, body);
    const condText = body.condition ? conditionLabel(lang, body.condition) : '';
    const todText = body.timeOfDay ? timeOfDayLabel(lang, body.timeOfDay) : '';

    let forecastBlock = '';
    if (body.forecast && body.forecast.length > 0) {
      const lines = body.forecast.map((f) =>
        lang === 'ko'
          ? `  · ${f.hour}시: ${fcLabel('ko', f)}, ${f.temp}°C, 강수확률 ${f.popPercent}%`
          : `  · ${f.hour}:00 — ${fcLabel('en', f)}, ${f.temp}°C, ${f.popPercent}% rain`,
      );
      forecastBlock =
        lang === 'ko'
          ? `\n향후 12시간 예보 (3시간 간격):\n${lines.join('\n')}`
          : `\nNext 12h forecast (3h steps):\n${lines.join('\n')}`;
    }

    const pool = ACTIVITY_POOL[lang];
    const pick = pool[Math.floor(Math.random() * pool.length)];

    const userPrompt =
      lang === 'ko'
        ? `현재 상황:
- 요일: ${kst.weekday}요일${kst.isWeekend ? ' (주말)' : ' (평일)'}
- 계절: ${kst.season}
- 시간대: ${todText} (${body.hour}시)
- 날씨: ${condText}
- 현재 기온: ${body.temp}°C
- 오늘 최저/최고: ${body.tempMin}°C / ${body.tempMax}°C${metrics ? '\n' + metrics : ''}${forecastBlock}

이 상황에 딱 어울리는 활동을 하나, 장면이 그려지게 묘사해서 추천해주세요.
- 향후 예보가 있으면 꼭 반영하세요.
- 자외선/미세먼지/강수량도 고려하세요 (높은 자외선·나쁜 미세먼지·비 → 실내나 대비 제안).
- 요일·시간 분위기를 살리세요.
- 이번엔 가능하면 '${pick}' 쪽에서 떠올려보세요. 안 맞으면 다른 결로 자유롭게.
- 매번 똑같은 추천은 피하고 신선하게요. (2~3문장)`
        : `Current context:
- Day: ${kst.weekday}${kst.isWeekend ? ' (weekend)' : ' (weekday)'}
- Season: ${kst.season}
- Time of day: ${todText} (${body.hour}:00)
- Weather: ${condText}
- Current temp: ${body.temp}°C
- Today's low/high: ${body.tempMin}°C / ${body.tempMax}°C${metrics ? '\n' + metrics : ''}${forecastBlock}

Recommend ONE activity that fits this moment, described so the scene comes alive.
- Reflect the forecast if present.
- Consider UV / air quality / rainfall (high UV, bad air, or rain → suggest indoor or precautions).
- Honor the day/time mood.
- This time, try the '${pick}' direction — switch freely if it doesn't fit.
- Avoid repeating the same suggestion; keep it fresh. (2-3 sentences)`;

    const { text } = await callClaude({
      systemPrompt: lang === 'ko' ? SYSTEM_PROMPT_KO : SYSTEM_PROMPT_EN,
      userPrompt,
      maxTokens: 280,
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
