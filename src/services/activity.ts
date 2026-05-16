import { WeatherInfo, CONDITION_META, getTimeOfDay, TIME_OF_DAY_KO } from '../constants/weather';

const CLAUDE_API_KEY = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const ACTIVITY_SYSTEM_PROMPT = `당신은 날씨에 어울리는 활동을 제안해주는 친한 친구입니다.

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

export interface ActivityRecommendation {
  text: string;
  generatedAt: Date;
}

export async function generateActivity(weather: WeatherInfo): Promise<ActivityRecommendation> {
  if (!CLAUDE_API_KEY) {
    throw new Error('Claude API 키가 설정되지 않았습니다.');
  }

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = getTimeOfDay(hour);
  const timeOfDayKo = TIME_OF_DAY_KO[timeOfDay];

  const conditionKo = CONDITION_META[weather.condition].ko;

  const userPrompt = `현재 상황:
- 시간대: ${timeOfDayKo} (${hour}시)
- 날씨: ${conditionKo}
- 현재 기온: ${weather.temp}°C
- 오늘 최저/최고: ${weather.tempMin}°C / ${weather.tempMax}°C

이 상황에 딱 어울리는 활동을 하나 추천해주세요.`;

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 250,
      system: [
        {
          type: 'text',
          text: ACTIVITY_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`활동 추천 실패: ${response.status} ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text ?? '';

  if (!text) throw new Error('활동 추천 결과가 없습니다.');

  return { text: text.trim(), generatedAt: new Date() };
}
