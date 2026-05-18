// 날씨 기반 음식 추천 Edge Function

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/claude.ts';
import { requireUser, checkAndLog, limitExceededResponse } from '../_shared/limit.ts';

const SYSTEM_PROMPT = `당신은 한국의 날씨에 어울리는 음식을 추천해주는 친한 친구입니다.

규칙:
- 현재 날씨, 기온, 시간대를 모두 반영하세요
- 한국인 정서에 맞는 음식 위주로 추천하세요 (한식 우선, 매식/양식도 가능)
- 음식 1가지를 콕 집어서 추천하고, 왜 이 날씨에 어울리는지 자연스럽게 설명하세요
- 친근하고 다정한 친구 말투로 ("~ 어떠세요?", "~ 어때요?")
- 2~3문장만, 그 이상 쓰지 마세요
- 마지막에 어울리는 이모지 1~2개를 붙여주세요
- 설명 없이 추천만 출력하세요

예시:
- 비 오는 날: "오늘 같이 비 오는 날엔 따끈한 김치전에 막걸리 한 잔 어떠세요? 빗소리 들으면서 먹으면 그 맛이 또 다르잖아요 🥞🍶"
- 더운 날: "오늘 진짜 덥네요! 시원한 냉면 한 그릇이면 더위가 확 날아갈 거예요. 식초 살짝 더 넣어서 새콤하게 드셔보세요 🍜❄️"
- 추운 날: "이런 날씨엔 김치찌개에 따뜻한 밥 한 공기가 최고죠. 속이 든든해지면 추위도 견딜만해질 거예요 🍲"
- 스트레스 받을 때(흐림/우중충): "오늘은 매콤한 떡볶이로 스트레스 한 방에 날려보는 건 어떨까요? 매운 거 한 입만 먹어도 기분이 풀려요 🌶️🔥"
- 맑은 봄날: "햇살 좋은 오늘은 가벼운 비빔국수 어떠세요? 새콤달콤한 양념에 속이 가볍게 채워질 거예요 🌸"`;

interface RequestBody {
  conditionKo: string;
  timeOfDayKo: string;
  hour: number;
  temp: number;
  tempMin: number;
  tempMax: number;
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

    const userPrompt = `현재 상황:
- 시간대: ${body.timeOfDayKo} (${body.hour}시) — ${mealHint}
- 날씨: ${body.conditionKo}
- 현재 기온: ${body.temp}°C
- 오늘 최저/최고: ${body.tempMin}°C / ${body.tempMax}°C

이 상황에 딱 어울리는 음식 1가지를 추천해주세요.`;

    const { text } = await callClaude({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 250,
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
