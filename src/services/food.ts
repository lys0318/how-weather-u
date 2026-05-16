import { WeatherInfo, CONDITION_META, getTimeOfDay, TIME_OF_DAY_KO } from '../constants/weather';

const CLAUDE_API_KEY = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const FOOD_SYSTEM_PROMPT = `당신은 한국의 날씨에 어울리는 음식을 추천해주는 친한 친구입니다.

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

export interface FoodRecommendation {
  text: string;
  generatedAt: Date;
}

export async function generateFood(weather: WeatherInfo): Promise<FoodRecommendation> {
  if (!CLAUDE_API_KEY) {
    throw new Error('Claude API 키가 설정되지 않았습니다.');
  }

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = getTimeOfDay(hour);
  const timeOfDayKo = TIME_OF_DAY_KO[timeOfDay];

  const conditionKo = CONDITION_META[weather.condition].ko;

  // 식사 시간대 힌트
  const mealHint =
    hour >= 6 && hour < 10 ? '아침 식사' :
    hour >= 10 && hour < 14 ? '점심 식사' :
    hour >= 14 && hour < 17 ? '간식 / 늦은 점심' :
    hour >= 17 && hour < 21 ? '저녁 식사' :
    '야식 / 늦은 시간';

  const userPrompt = `현재 상황:
- 시간대: ${timeOfDayKo} (${hour}시) — ${mealHint}
- 날씨: ${conditionKo}
- 현재 기온: ${weather.temp}°C
- 오늘 최저/최고: ${weather.tempMin}°C / ${weather.tempMax}°C

이 상황에 딱 어울리는 음식 1가지를 추천해주세요.`;

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
          text: FOOD_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`음식 추천 실패: ${response.status} ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text ?? '';

  if (!text) throw new Error('음식 추천 결과가 없습니다.');

  return { text: text.trim(), generatedAt: new Date() };
}
