// 감성 메시지 생성 Edge Function
// 클라이언트는 Claude API 키 모름. 서버가 대신 호출.
// 클라이언트는 enum/숫자 + lang 만 보내고, 서버가 언어에 맞춰 프롬프트 구성.

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/claude.ts';
import { requireUser, checkAndLog, limitExceededResponse } from '../_shared/limit.ts';
import {
  Lang,
  conditionLabel,
  timeOfDayLabel,
  dowLabel,
} from '../_shared/labels.ts';

const SYSTEM_PROMPT_KO = `당신은 날씨와 시간대에 맞춰 마음에 닿는 메시지를 써주는 따뜻한 작가입니다.

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

const SYSTEM_PROMPT_EN = `You are a warm writer who crafts short messages that resonate, tuned to the weather and time of day.

Rules:
- Let the weather, day of week, and time of day come through naturally
- Don't open with a literal "Today's weather is ~"
- End with 1-2 fitting emojis
- 2-3 sentences, no more (short but lingering)
- Output only the message — no explanations or extra text

★ Quality — make even one line stay with the reader:
- Weave the weather in sensorially. Sketch a fragment of the view, light, air, or sound, then carry that mood into the reader's heart.
  (e.g., "The grey sky hangs heavy this evening, yet here you are, having walked through it all the same.")
- Avoid clichés ("hang in there", "you got this"); be specific and sincere.
- Honor the texture of the day and hour (the weight of Monday morning, the relief of Friday evening, the quiet of late night).

Tone guide:
- comfort: deep empathy, the feeling of someone staying by your side after a hard day
- cheer: not forced hype, but sincere encouragement that says "I believe in you"
- advice: use the weather to suggest a small, concrete action to try now — e.g., "On a rainy day, calmly tackle that task you've been putting off."`;

interface RequestBody {
  condition?: string;
  timeOfDay?: string;
  dayOfWeek?: number;
  preference: 'comfort' | 'cheer' | 'advice';
  lang?: Lang;
  // ── 구버전 클라이언트 호환 (enum 도입 전) ──
  conditionKo?: string;
  timeOfDayKo?: string;
  dayOfWeekKo?: string;
}

const TONE_GUIDE: Record<Lang, Record<string, string>> = {
  ko: {
    comfort: '위로와 공감 위주로, 힘든 하루를 보내는 사람에게 따뜻하게',
    cheer: '응원과 격려 위주로, 에너지를 북돋아주는 느낌으로',
    advice:
      '조언과 행동 제안 위주로, 날씨를 활용해서 일이 안 풀리거나 고민이 있는 사람에게 구체적으로 무엇을 해보면 좋을지 추천',
  },
  en: {
    comfort: 'focus on comfort and empathy, warmly, for someone having a hard day',
    cheer: 'focus on cheer and encouragement, lifting their energy',
    advice:
      'focus on advice and a concrete action — use the weather to suggest something specific to try for someone who is stuck or worried',
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await requireUser(req);

    const usage = await checkAndLog(user.id, 'message');
    if (!usage.ok) {
      return limitExceededResponse(usage.used, usage.limit, corsHeaders);
    }

    const body = (await req.json()) as RequestBody;

    // 신·구 포맷 모두 허용 (condition enum 또는 구버전 conditionKo)
    if (!body.preference || (!body.condition && !body.conditionKo)) {
      return new Response(
        JSON.stringify({ error: 'missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const lang: Lang = body.lang === 'en' ? 'en' : 'ko';
    const toneGuide = TONE_GUIDE[lang][body.preference];

    // 라벨: 신버전(enum)이면 lang 라벨링, 구버전이면 받은 한국어 문자열 사용
    const condText = body.condition ? conditionLabel(lang, body.condition) : (body.conditionKo ?? '');
    const todText = body.timeOfDay ? timeOfDayLabel(lang, body.timeOfDay) : (body.timeOfDayKo ?? '');
    const dowText =
      body.dayOfWeek !== undefined && body.dayOfWeek !== null
        ? lang === 'ko'
          ? `${dowLabel('ko', body.dayOfWeek)}요일`
          : dowLabel('en', body.dayOfWeek)
        : (body.dayOfWeekKo ?? '');

    const userPrompt =
      lang === 'ko'
        ? `현재 상황:
- 날씨: ${condText}
- 요일: ${dowText}
- 시간대: ${todText}
- 메시지 톤: ${toneGuide}

위 조건을 모두 자연스럽게 녹여서 감성적인 메시지를 써주세요.`
        : `Current context:
- Weather: ${condText}
- Day: ${dowText}
- Time of day: ${todText}
- Message tone: ${toneGuide}

Weave all of the above in naturally and write a heartfelt message in English.`;

    const { text } = await callClaude({
      systemPrompt: lang === 'ko' ? SYSTEM_PROMPT_KO : SYSTEM_PROMPT_EN,
      userPrompt,
      maxTokens: 320,
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
