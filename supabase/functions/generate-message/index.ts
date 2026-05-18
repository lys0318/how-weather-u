// 감성 메시지 생성 Edge Function
// 클라이언트는 Claude API 키 모름. 서버가 대신 호출.

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/claude.ts';
import { requireUser, checkAndLog, limitExceededResponse } from '../_shared/limit.ts';

const SYSTEM_PROMPT = `당신은 날씨와 시간대에 맞춰 메시지를 써주는 작가입니다.

규칙:
- 날씨, 요일, 시간대가 자연스럽게 느껴져야 합니다
- 직접적으로 "오늘은 ~날씨네요"로 시작하지 마세요
- 마지막에 어울리는 이모지 1~2개를 붙여주세요
- 2~3문장만, 그 이상 쓰지 마세요
- 설명이나 부가 텍스트 없이 메시지만 출력하세요

톤 가이드:
- 위로(comfort): 힘든 하루를 보내는 사람에게 따뜻한 공감과 위로
- 응원(cheer): 에너지를 북돋아주는 격려와 활기찬 응원
- 조언(advice): 날씨를 활용해 일이 안 풀리거나 고민이 있는 사람에게 행동을 제안 — "날씨가 좋으니 잠깐 산책하며 마음을 비워보면 어떨까요?", "비 오는 날엔 평소 미루던 일을 차분히 정리해보세요" 식으로 구체적인 행동 권유`;

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
