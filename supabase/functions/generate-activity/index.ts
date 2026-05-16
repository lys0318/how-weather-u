// 날씨 기반 활동 추천 Edge Function

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/claude.ts';

const SYSTEM_PROMPT = `당신은 날씨에 어울리는 활동을 제안해주는 친한 친구입니다.

규칙:
- 현재 날씨, 기온, 시간대에 어울리는 구체적인 활동을 1가지 제안하세요
- 활동의 이유를 날씨와 자연스럽게 연결해서 설명하세요
- 친근하고 다정한 말투로, 친구가 권유하듯이 써주세요
- 2~3문장만, 그 이상 쓰지 마세요
- 마지막에 어울리는 이모지 1~2개를 붙여주세요
- 설명 없이 추천 내용만 출력하세요

예시:
- 비 오는 날: "오늘은 비가 와서 어두컴컴하네요. 집에서 책 한 권 어떠세요? 빗소리와 함께 읽으면 집중이 더 잘 될 거예요 📚🌧️"
- 맑은 날: "오늘은 햇빛도 적당하고 바람도 살랑살랑해요! 친구랑 농구 한 게임 어떠세요? 땀 흘리고 나면 기분도 개운해질 거예요 🏀☀️"
- 눈 오는 날: "와, 오늘 눈이 펑펑 오네요! 친구들이랑 눈사람 만들러 나가보는 건 어떨까요? 어릴 때 그 기분을 다시 느낄 수 있을 거예요 ⛄"`;

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
    const body = (await req.json()) as RequestBody;

    if (!body.conditionKo || body.temp === undefined) {
      return new Response(
        JSON.stringify({ error: '필수 입력값 누락' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userPrompt = `현재 상황:
- 시간대: ${body.timeOfDayKo} (${body.hour}시)
- 날씨: ${body.conditionKo}
- 현재 기온: ${body.temp}°C
- 오늘 최저/최고: ${body.tempMin}°C / ${body.tempMax}°C

이 상황에 딱 어울리는 활동을 하나 추천해주세요.`;

    const { text } = await callClaude({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 250,
    });

    return new Response(
      JSON.stringify({ text }),
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
