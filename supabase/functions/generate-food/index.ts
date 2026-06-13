// 날씨 기반 음식 추천 Edge Function (ko/en)

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/claude.ts';
import { requireUser, checkAndLog, limitExceededResponse } from '../_shared/limit.ts';
import { getKstContext } from '../_shared/datetime.ts';
import { Lang, conditionLabel, timeOfDayLabel, metricLines } from '../_shared/labels.ts';

const SYSTEM_PROMPT_KO = `당신은 한국의 날씨에 어울리는 음식을 맛깔나게 추천해주는 친한 친구입니다.

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
- 가능하면 제철 재료/계절 별미를 살리세요.
- 미세먼지가 나쁘면 배달·집밥처럼 실내에서 즐길 메뉴를, 비가 오면 따뜻한 국물요리를 슬쩍 권해도 좋아요.

★ 다양성:
- 라면·국물요리만 반복하지 마세요. 매번 다른 메뉴를 신선하게.`;

const SYSTEM_PROMPT_EN = `You are a close friend who recommends food that fits the weather, in a mouthwatering way.

Rules:
- Reflect the current weather, temperature, time of day, day of week, and season
- Recommend dishes broadly (any cuisine — Korean, Western, Chinese, Japanese, Asian, snacks, dessert, drinks)
- Pick exactly ONE dish
- Warm, friendly, casual tone ("how about ~?", "~ sounds perfect")
- 2-3 sentences, no more (keep it short)
- End with 1-2 fitting emojis
- Output only the recommendation, no explanations
- Write in natural English

★ Quality — make their mouth water:
- Don't just name a dish; vividly describe texture, temperature, aroma, the first bite.
- Lean into seasonal ingredients when you can.
- If air quality is bad, lean toward something to enjoy indoors (delivery/home-cooked); if it's raining, a warm, brothy dish.

★ Variety:
- Don't keep repeating noodles/soup. Bring a fresh dish each time.`;

interface ForecastSlot {
  hour: number;
  condition?: string;
  conditionKo?: string; // 구버전 호환
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
  // ── 구버전 클라이언트 호환 ──
  conditionKo?: string;
  timeOfDayKo?: string;
}

function fcLabel(lang: Lang, f: ForecastSlot): string {
  return f.condition ? conditionLabel(lang, f.condition) : (f.conditionKo ?? '');
}

const CUISINE_POOL: Record<Lang, string[]> = {
  ko: [
    '국·탕·찌개류', '면요리', '밥·덮밥·볶음밥', '구이·고기류', '분식',
    '볶음요리', '전·부침류', '양식', '중식', '일식', '아시안 음식',
    '죽·수프류', '샐러드·가벼운 식사', '디저트·간식', '따뜻한 음료·차',
  ],
  en: [
    'soups & stews', 'noodles', 'rice bowls & fried rice', 'grilled meats', 'street food',
    'stir-fry', 'savory pancakes', 'Western', 'Chinese', 'Japanese', 'other Asian',
    'porridge & soup', 'salad & light meals', 'dessert & snacks', 'warm drinks & tea',
  ],
};

function mealHint(lang: Lang, hour: number): string {
  if (lang === 'ko') {
    return hour >= 6 && hour < 10 ? '아침 식사'
      : hour >= 10 && hour < 14 ? '점심 식사'
      : hour >= 14 && hour < 17 ? '간식 / 늦은 점심'
      : hour >= 17 && hour < 21 ? '저녁 식사'
      : '야식 / 늦은 시간';
  }
  return hour >= 6 && hour < 10 ? 'breakfast'
    : hour >= 10 && hour < 14 ? 'lunch'
    : hour >= 14 && hour < 17 ? 'snack / late lunch'
    : hour >= 17 && hour < 21 ? 'dinner'
    : 'late-night snack';
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

    if ((!body.condition && !body.conditionKo) || body.temp === undefined) {
      return new Response(
        JSON.stringify({ error: 'missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const lang: Lang = body.lang === 'en' ? 'en' : 'ko';
    const kst = getKstContext(lang);
    const meal = mealHint(lang, body.hour);
    const metrics = metricLines(lang, body);
    const condText = body.condition ? conditionLabel(lang, body.condition) : (body.conditionKo ?? '');
    const todText = body.timeOfDay ? timeOfDayLabel(lang, body.timeOfDay) : (body.timeOfDayKo ?? '');

    // 향후 예보
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

    const pool = CUISINE_POOL[lang];
    const pick = pool[Math.floor(Math.random() * pool.length)];

    const userPrompt =
      lang === 'ko'
        ? `현재 상황:
- 요일: ${kst.weekday}요일${kst.isWeekend ? ' (주말)' : ''}
- 계절: ${kst.season} (${kst.seasonHint})
- 시간대: ${todText} (${body.hour}시) — ${meal}
- 날씨: ${condText}
- 현재 기온: ${body.temp}°C
- 오늘 최저/최고: ${body.tempMin}°C / ${body.tempMax}°C${metrics ? '\n' + metrics : ''}${forecastBlock}

이 상황에 딱 어울리는 음식 1가지를 침이 고이게 묘사해서 추천해주세요.
- 향후 예보가 있으면 반영하세요 (예: 이따 비 올 예정이면 따뜻한 국물요리).
- 미세먼지가 나쁘면 실내에서 즐길 메뉴, 강수량이 있으면 따뜻한 메뉴를 고려하세요.
- 제철 재료를 살리면 좋아요. 요일 분위기도 슬쩍 녹여도 좋고요.
- 이번엔 가능하면 '${pick}' 계열에서 떠올려보세요. 단, 지금 날씨/시간과 영 안 맞으면 다른 계열로 자유롭게 바꿔도 좋아요.
- 라면처럼 뻔한 선택은 피하고 신선한 메뉴로요. (2~3문장)`
        : `Current context:
- Day: ${kst.weekday}${kst.isWeekend ? ' (weekend)' : ''}
- Season: ${kst.season} (${kst.seasonHint})
- Time of day: ${todText} (${body.hour}:00) — ${meal}
- Weather: ${condText}
- Current temp: ${body.temp}°C
- Today's low/high: ${body.tempMin}°C / ${body.tempMax}°C${metrics ? '\n' + metrics : ''}${forecastBlock}

Recommend exactly ONE dish that fits this moment, described to make their mouth water.
- Reflect the forecast if present (e.g., rain coming later → a warm brothy dish).
- If air quality is bad, prefer something enjoyed indoors; if it's raining, prefer something warm.
- Lean into seasonal ingredients. A subtle nod to the day's mood is welcome.
- This time, try to draw from the '${pick}' category — but if it clashes with the weather/time, feel free to switch.
- Avoid obvious choices; keep it fresh. (2-3 sentences)`;

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
