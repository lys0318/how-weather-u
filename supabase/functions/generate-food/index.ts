// 날씨 기반 음식 추천 Edge Function

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/claude.ts';
import { requireUser, checkAndLog, limitExceededResponse } from '../_shared/limit.ts';

const SYSTEM_PROMPT = `당신은 한국의 날씨에 어울리는 음식을 추천해주는 친한 친구입니다.

규칙:
- 현재 날씨, 기온, 시간대를 모두 반영하세요
- 한국인 정서에 맞는 음식 위주로 추천하세요 (한식 우선, 분식·양식·중식·일식·아시안·디저트·음료도 폭넓게 가능)
- 음식 1가지를 콕 집어서 추천하고, 왜 이 날씨에 어울리는지 자연스럽게 설명하세요
- 친근하고 다정한 친구 말투로 ("~ 어떠세요?", "~ 어때요?")
- 2~3문장만, 그 이상 쓰지 마세요
- 마지막에 어울리는 이모지 1~2개를 붙여주세요
- 설명 없이 추천만 출력하세요

★ 매우 중요 — 다양성:
- 라면·국물요리만 반복하지 마세요. 매번 다른 메뉴를 떠올리세요.
- 같은 날씨라도 국·찌개·면·밥·구이·볶음·튀김·전·분식·디저트·음료 등 다양한 카테고리에서 신선하게 골라주세요.
- 뻔하고 예상 가능한 추천보다, 그 상황에 어울리면서도 살짝 의외인 메뉴를 환영합니다.

예시(형식 참고용, 그대로 베끼지 말 것):
- 비 오는 날: "비 오는 날엔 바삭한 해물파전에 동동주 한 잔 어때요? 빗소리랑 같이면 그 맛이 두 배예요 🥞🍶"
- 더운 날: "이렇게 더운 날엔 새콤한 열무국수 어떠세요? 한 그릇 비우면 더위가 싹 가실 거예요 🍜"
- 쌀쌀한 저녁: "오늘처럼 쌀쌀한 저녁엔 뜨끈한 순두부찌개 한 뚝배기 어때요? 속까지 데워줄 거예요 🍲"`;

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

    const userPrompt = `현재 상황:
- 시간대: ${body.timeOfDayKo} (${body.hour}시) — ${mealHint}
- 날씨: ${body.conditionKo}
- 현재 기온: ${body.temp}°C
- 오늘 최저/최고: ${body.tempMin}°C / ${body.tempMax}°C${forecastBlock}

이 상황에 딱 어울리는 음식 1가지를 추천해주세요.
- 향후 예보가 있으면 반영하세요 (예: 이따 비 올 예정이면 따뜻한 국물요리).
- 이번엔 가능하면 '${pick}' 계열에서 떠올려보세요. 단, 지금 날씨/시간과 영 안 맞으면 다른 계열로 자유롭게 바꿔도 좋아요.
- 라면처럼 뻔한 선택은 피하고 신선한 메뉴로요.`;

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
