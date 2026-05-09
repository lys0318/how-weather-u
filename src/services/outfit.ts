import { WeatherInfo, CONDITION_META, getTimeOfDay, TIME_OF_DAY_KO } from '../constants/weather';

const CLAUDE_API_KEY = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const OUTFIT_SYSTEM_PROMPT = `당신은 날씨와 기온에 맞는 의상을 추천해주는 스타일리스트입니다.

규칙:
- 현재 시간대(아침/오후/저녁/밤)를 기준으로 외출 상황을 반영하세요
- 아침이면 "아침엔 ~도로 쌀쌀하지만 낮엔 ~도까지 올라요"처럼 일교차도 언급하세요
- 오후/저녁은 현재 기온 중심으로 추천하세요
- 구체적인 옷 아이템을 언급하세요 (예: 얇은 가디건, 방수 재킷, 반팔 티셔츠 등)
- 2~3문장으로 짧고 실용적으로 써주세요
- 마지막에 어울리는 이모지 1개를 붙여주세요
- 설명 없이 추천 내용만 출력하세요`;

export interface OutfitRecommendation {
  text: string;
  generatedAt: Date;
}

export async function generateOutfit(weather: WeatherInfo): Promise<OutfitRecommendation> {
  if (!CLAUDE_API_KEY) {
    throw new Error('Claude API 키가 설정되지 않았습니다.');
  }

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = getTimeOfDay(hour);
  const timeOfDayKo = TIME_OF_DAY_KO[timeOfDay];

  const conditionKo = CONDITION_META[weather.condition].ko;
  const tempRange = weather.tempMax - weather.tempMin;
  const tempRangeNote = tempRange >= 8
    ? `일교차가 ${tempRange}도로 큰 편이에요.`
    : `일교차는 ${tempRange}도로 크지 않아요.`;

  // 시간대별 외출 상황 설명
  const timeContext: Record<string, string> = {
    morning: `지금은 아침(${hour}시)이에요. 하루를 시작하기 전 옷차림을 추천해주세요.`,
    afternoon: `지금은 오후(${hour}시)예요. 낮 시간대 활동에 맞는 옷차림을 추천해주세요.`,
    evening: `지금은 저녁(${hour}시)이에요. 외출하거나 귀가 시 적합한 옷차림을 추천해주세요.`,
    night: `지금은 밤(${hour}시)이에요. 야간 외출 시 적합한 옷차림을 추천해주세요.`,
  };

  const userPrompt = `현재 시간대: ${timeOfDayKo} (${hour}시)
${timeContext[timeOfDay]}

날씨 정보:
- 날씨 상태: ${conditionKo}
- 현재 기온: ${weather.temp}°C
- 오늘 최저: ${weather.tempMin}°C / 최고: ${weather.tempMax}°C
- ${tempRangeNote}

위 조건에 맞는 오늘의 의상을 추천해주세요.`;

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
          text: OUTFIT_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`의상 추천 실패: ${response.status} ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text ?? '';

  if (!text) throw new Error('의상 추천 결과가 없습니다.');

  return { text: text.trim(), generatedAt: new Date() };
}
