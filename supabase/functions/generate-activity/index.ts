// 날씨 기반 활동 추천 Edge Function

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/claude.ts';
import { requireUser, checkAndLog, limitExceededResponse } from '../_shared/limit.ts';

const SYSTEM_PROMPT = `당신은 날씨에 어울리는 활동을 제안해주는 친한 친구입니다.

규칙:
- 현재 날씨, 기온, 시간대에 어울리는 구체적인 활동을 1가지 제안하세요
- **향후 예보(강수 확률, 날씨 변화)도 적극 반영**하세요
  · 예: 지금은 맑지만 오후에 비 예정 → 야외 활동은 오전에 권유하거나 실내 추천
  · 예: 지금은 비 오지만 곧 갬 → 잠시 후 산책 추천 가능
- 활동의 이유를 날씨와 자연스럽게 연결해서 설명하세요
- 친근하고 다정한 말투로, 친구가 권유하듯이 써주세요
- 2~3문장만, 그 이상 쓰지 마세요
- 마지막에 어울리는 이모지 1~2개를 붙여주세요
- 설명 없이 추천 내용만 출력하세요

예시:
- 지금 맑음 + 오후 비 예보: "지금은 햇빛이 좋지만 오후엔 비가 올 수도 있대요. 비 오기 전에 가벼운 산책 한번 어떠세요? 우산은 챙기시고요 🚶‍♀️☂️"
- 비 오는 날: "오늘은 비가 와서 어두컴컴하네요. 집에서 책 한 권 어떠세요? 빗소리와 함께 읽으면 집중이 더 잘 될 거예요 📚🌧️"
- 맑은 날 (예보도 맑음): "오늘은 햇빛도 적당하고 바람도 살랑살랑해요! 친구랑 농구 한 게임 어떠세요? 땀 흘리고 나면 기분도 개운해질 거예요 🏀☀️"
- 눈 오는 날: "와, 오늘 눈이 펑펑 오네요! 친구들이랑 눈사람 만들러 나가보는 건 어떨까요? 어릴 때 그 기분을 다시 느낄 수 있을 거예요 ⛄"`;

interface ForecastSlot {
  hour: number;
  conditionKo: string;
  temp: number;
  popPercent: number; // 강수 확률 0~100
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
    const usage = await checkAndLog(user.id, 'activity');
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

    // 향후 예보 요약 (있으면 prompt에 포함)
    let forecastBlock = '';
    if (body.forecast && body.forecast.length > 0) {
      const lines = body.forecast.map(
        (f) => `  · ${f.hour}시: ${f.conditionKo}, ${f.temp}°C, 강수확률 ${f.popPercent}%`,
      );
      forecastBlock = `\n향후 12시간 예보 (3시간 간격):\n${lines.join('\n')}`;
    }

    // 다양성 변주 — 매 호출마다 랜덤 활동 결을 살짝 제시해 반복 방지
    const ACTIVITY_POOL = [
      '가벼운 운동·산책', '집에서 하는 취미', '카페·휴식', '문화생활(영화·전시·음악)',
      '독서·글쓰기', '요리·베이킹', '친구·가족과 함께하는 일', '자기계발·공부',
      '정리·청소', '사진 찍기·기록', '명상·스트레칭', '새로운 곳 탐방',
    ];
    const pick = ACTIVITY_POOL[Math.floor(Math.random() * ACTIVITY_POOL.length)];

    const userPrompt = `현재 상황:
- 시간대: ${body.timeOfDayKo} (${body.hour}시)
- 날씨: ${body.conditionKo}
- 현재 기온: ${body.temp}°C
- 오늘 최저/최고: ${body.tempMin}°C / ${body.tempMax}°C${forecastBlock}

이 상황에 딱 어울리는 활동을 하나 추천해주세요.
- 향후 예보가 있으면 꼭 반영하세요 (비가 곧 올 예정이면 야외활동을 미루거나 비 오기 전 짧은 산책 등 시간 흐름 고려).
- 이번엔 가능하면 '${pick}' 쪽에서 떠올려보세요. 단, 지금 날씨/시간과 안 맞으면 다른 결로 자유롭게 바꿔도 좋아요.
- 매번 똑같은 추천(독서·산책만 반복 등)은 피하고 신선하게요.`;

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
