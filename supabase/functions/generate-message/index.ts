// 감성 메시지 생성 Edge Function
// 클라이언트는 Claude API 키 모름. 서버가 대신 호출.

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/claude.ts';
import { requireUser, checkAndLog, limitExceededResponse } from '../_shared/limit.ts';

const SYSTEM_PROMPT = `당신은 날씨와 시간대에 맞춰 마음에 닿는 메시지를 써주는 따뜻한 작가입니다.

규칙:
- 날씨, 요일, 시간대가 자연스럽게 느껴져야 합니다
- 직접적으로 "오늘은 ~날씨네요"로 시작하지 마세요
- 마지막에 어울리는 이모지 1~2개를 붙여주세요
- 2~3문장, 그 이상 쓰지 마세요 (짧지만 여운 있게)
- 설명이나 부가 텍스트 없이 메시지만 출력하세요

★ 퀄리티 — 한 줄이라도 마음에 남게:
- 날씨를 감각적으로 녹이세요. 창밖 풍경·빛·공기·소리를 한 조각 그려 넣되, 거기서 끝내지 말고 그 분위기를 받는 사람의 마음으로 자연스럽게 이어가세요.
  (예: "흐린 하늘이 무겁게 내려앉은 저녁이지만, 그 아래서도 묵묵히 걸어온 당신이에요.")
- 뻔한 표현("힘내세요", "파이팅")은 피하고, 구체적이고 진심 어린 한마디로.
- 요일·시간의 결을 살리세요 (월요일 아침의 무게, 금요일 저녁의 안도, 늦은 밤의 고요 등).

톤 가이드:
- 위로(comfort): 힘든 하루를 보낸 사람에게 깊이 공감하며 곁에 있어주는 느낌으로
- 응원(cheer): 억지 텐션이 아니라, 당신을 믿는다는 진심 어린 격려로
- 조언(advice): 날씨를 활용해 지금 해볼 만한 작은 행동을 구체적으로 권유 — "비 오는 날엔 평소 미루던 일을 차분히 정리해보세요" 식으로`;

interface RequestBody {
  conditionKo: string;
  conditionEmoji: string;
  timeOfDayKo: string;
  dayOfWeekKo: string;
  preference: 'comfort' | 'cheer' | 'advice';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. 사용자 인증
    const user = await requireUser(req);

    // 2. 일일 제한 체크 + 기록
    const usage = await checkAndLog(user.id, 'message');
    if (!usage.ok) {
      return limitExceededResponse(usage.used, usage.limit, corsHeaders);
    }

    const body = (await req.json()) as RequestBody;

    // 입력 검증
    if (!body.conditionKo || !body.preference) {
      return new Response(
        JSON.stringify({ error: '필수 입력값 누락' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const toneGuide =
      body.preference === 'comfort'
        ? '위로와 공감 위주로, 힘든 하루를 보내는 사람에게 따뜻하게'
        : body.preference === 'cheer'
        ? '응원과 격려 위주로, 에너지를 북돋아주는 느낌으로'
        : '조언과 행동 제안 위주로, 날씨를 활용해서 일이 안 풀리거나 고민이 있는 사람에게 구체적으로 무엇을 해보면 좋을지 추천';

    const userPrompt = `현재 상황:
- 날씨: ${body.conditionKo} ${body.conditionEmoji}
- 요일: ${body.dayOfWeekKo}
- 시간대: ${body.timeOfDayKo}
- 메시지 톤: ${toneGuide}

위 조건을 모두 자연스럽게 녹여서 감성적인 메시지를 써주세요.`;

    const { text } = await callClaude({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 300,
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
