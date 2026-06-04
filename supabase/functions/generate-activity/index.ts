// 날씨 기반 활동 추천 Edge Function

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/claude.ts';
import { requireUser, checkAndLog, limitExceededResponse } from '../_shared/limit.ts';
import { getKstContext } from '../_shared/datetime.ts';

const SYSTEM_PROMPT = `당신은 날씨에 어울리는 활동을 제안해주는 친한 친구입니다.

규칙:
- 현재 날씨, 기온, 시간대, 요일에 어울리는 구체적인 활동을 1가지 제안하세요
- **향후 예보(강수 확률, 날씨 변화)도 적극 반영**하세요
  · 예: 지금은 맑지만 오후에 비 예정 → 야외 활동은 오전에 권유하거나 실내 추천
  · 예: 지금은 비 오지만 곧 갬 → 잠시 후 산책 추천 가능
- 친근하고 다정한 말투로, 친구가 권유하듯이 써주세요
- 2~3문장, 그 이상 쓰지 마세요 (길이는 짧게)
- 마지막에 어울리는 이모지 1~2개를 붙여주세요
- 설명 없이 추천 내용만 출력하세요

★ 퀄리티 — 장면이 그려지게 하세요:
- 활동 이름만 던지지 말고, 그 순간의 감각·기분을 생생하게 묘사하세요.
  (예: "선선한 바람 맞으며", "따뜻한 커피 한 잔 들고", "노을 지는 창가에서")
- 요일·시간 맥락을 살리세요 (평일 저녁엔 하루를 정리하는, 주말 낮엔 여유로운, 퇴근 후엔 긴장 푸는 식).
- 그 날씨라서 더 좋은 이유를 자연스럽게 엮으세요.

★ 다양성:
- 독서·산책만 반복하지 마세요. 운동·취미·문화·요리·휴식·기록 등 폭넓게.

예시(분위기 참고용, 그대로 베끼지 말 것):
- 비 오는 평일 저녁: "창밖에 비 내리는 오늘 저녁엔, 좋아하는 플레이리스트 틀어두고 따뜻한 차 한 잔과 미뤄둔 영화 한 편 어떠세요? 빗소리가 배경음이 되어줄 거예요 🎬☔"
- 맑은 주말 낮: "이렇게 햇살 좋은 주말 낮엔 가까운 공원에 돗자리 펴고 앉아보는 건 어때요? 선선한 바람 맞으며 멍 때리기만 해도 충전될 거예요 🌳☀️"`;

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

    const kst = getKstContext();

    const userPrompt = `현재 상황:
- 요일: ${kst.weekday}요일${kst.isWeekend ? ' (주말)' : ' (평일)'}
- 계절: ${kst.season}
- 시간대: ${body.timeOfDayKo} (${body.hour}시)
- 날씨: ${body.conditionKo}
- 현재 기온: ${body.temp}°C
- 오늘 최저/최고: ${body.tempMin}°C / ${body.tempMax}°C${forecastBlock}

이 상황에 딱 어울리는 활동을 하나, 장면이 그려지게 묘사해서 추천해주세요.
- 향후 예보가 있으면 꼭 반영하세요 (비가 곧 올 예정이면 야외활동을 미루거나 비 오기 전 짧은 산책 등 시간 흐름 고려).
- 요일·시간 분위기를 살리세요 (평일/주말, 퇴근 후 등).
- 이번엔 가능하면 '${pick}' 쪽에서 떠올려보세요. 단, 지금 날씨/시간과 안 맞으면 다른 결로 자유롭게 바꿔도 좋아요.
- 매번 똑같은 추천(독서·산책만 반복)은 피하고 신선하게요. (2~3문장)`;

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
