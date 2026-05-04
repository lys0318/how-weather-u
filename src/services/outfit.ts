import { WeatherInfo, CONDITION_META } from '../constants/weather';

const CLAUDE_API_KEY = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const OUTFIT_SYSTEM_PROMPT = `당신은 날씨와 기온에 맞는 의상을 추천해주는 스타일리스트입니다.

규칙:
- 현재 기온, 최저/최고기온(일교차), 날씨 상태를 모두 반영하세요
- 구체적인 옷 아이템을 언급하세요 (예: 얇은 가디건, 방수 재킷, 반팔 티셔츠 등)
- 1~2문장으로 짧고 실용적으로 써주세요
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

  const conditionKo = CONDITION_META[weather.condition].ko;
  const tempRange = weather.tempMax - weather.tempMin;
  const tempRangeNote = tempRange >= 10
    ? `일교차가 ${tempRange}도로 크니 주의가 필요합니다.`
    : `일교차는 ${tempRange}도로 크지 않습니다.`;

  const userPrompt = `현재 날씨 정보:
- 날씨: ${conditionKo}
- 현재 기온: ${weather.temp}°C
- 최저 기온: ${weather.tempMin}°C / 최고 기온: ${weather.tempMax}°C
- ${tempRangeNote}

이 날씨에 맞는 오늘의 의상을 추천해주세요.`;

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
      max_tokens: 200,
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
