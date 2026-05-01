import {
  WeatherCondition,
  TimeOfDay,
  Preference,
  TIME_OF_DAY_KO,
  DAY_OF_WEEK_KO,
  CONDITION_META,
} from '../constants/weather';

const CLAUDE_API_KEY = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

export interface MessageContext {
  condition: WeatherCondition;
  timeOfDay: TimeOfDay;
  dayOfWeek: number; // 0(일) ~ 6(토)
  preference: Preference;
}

export interface GeneratedMessage {
  text: string;
  generatedAt: Date;
  context: MessageContext;
}

function buildPrompt(ctx: MessageContext): string {
  const conditionKo = CONDITION_META[ctx.condition].ko;
  const emoji = CONDITION_META[ctx.condition].emoji;
  const timeKo = TIME_OF_DAY_KO[ctx.timeOfDay];
  const dayKo = DAY_OF_WEEK_KO[ctx.dayOfWeek];
  const toneGuide =
    ctx.preference === 'comfort'
      ? '위로와 공감 위주로, 힘든 하루를 보내는 사람에게 따뜻하게'
      : '응원과 격려 위주로, 에너지를 북돋아주는 느낌으로';

  return `당신은 날씨와 시간대에 맞춰 감성적인 한 줄 메시지를 써주는 작가입니다.

현재 상황:
- 날씨: ${conditionKo} ${emoji}
- 요일: ${dayKo}
- 시간대: ${timeKo}
- 메시지 톤: ${toneGuide}

위 조건을 모두 자연스럽게 녹여서, 2~3문장의 짧고 감성적인 메시지를 한국어로 써주세요.

규칙:
- 날씨, 요일, 시간대가 느껴져야 합니다
- 직접적으로 "오늘은 ~날씨네요"로 시작하지 마세요
- 마지막에 어울리는 이모지 1~2개를 붙여주세요
- 2~3문장만, 그 이상 쓰지 마세요
- 설명이나 부가 텍스트 없이 메시지만 출력하세요`;
}

export async function generateMessage(ctx: MessageContext): Promise<GeneratedMessage> {
  if (!CLAUDE_API_KEY) {
    throw new Error('Claude API 키가 설정되지 않았습니다.');
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: buildPrompt(ctx),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `메시지 생성 실패: ${response.status} ${JSON.stringify(errorData)}`
    );
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text ?? '';

  if (!text) {
    throw new Error('생성된 메시지가 없습니다.');
  }

  return {
    text: text.trim(),
    generatedAt: new Date(),
    context: ctx,
  };
}
