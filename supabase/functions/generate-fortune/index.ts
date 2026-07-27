// 날씨 기반 오늘의 운세 Edge Function (ko/en)

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude, MODEL_HAIKU } from '../_shared/claude.ts';
import { requireUser, checkAndLog, limitExceededResponse } from '../_shared/limit.ts';
import { getKstContext } from '../_shared/datetime.ts';
import { Lang, conditionLabel, timeOfDayLabel, metricLines } from '../_shared/labels.ts';

const SYSTEM_PROMPT_KO = `당신은 날씨와 계절, 그리고 그 사람의 기운을 읽어 오늘의 운세를 전하는 점성가입니다.

규칙:
- 날씨, 기온, 시간대, 요일, 계절을 운세의 바탕으로 삼으세요
- 띠나 별자리가 주어지면 그 기운을 자연스럽게 엮으세요 (없으면 언급하지 마세요)
- 호칭이 있으면 한 번만 자연스럽게 부르세요
- 나이대·직업·관심사·고민이 있으면 그 사람의 오늘에 닿도록 반영하되, 정보를 나열하지 마세요
- 구체적이고 따뜻하게, 막연한 희망보다 오늘 하루에 집중
- 단정적인 불운·경고는 피하고, 조심스러운 조언으로 바꾸세요
- 의료·법률·금전에 대한 확정적 예언은 하지 마세요

출력 형식 (정확히 이 형식, 다른 말 없이):
{총운 2~3문장, 마지막에 어울리는 이모지 1~2개}
🎨 행운의 색: {색 이름}
🔢 행운의 숫자: {1~99 중 하나}
🍀 행운의 아이템: {오늘 날씨에 어울리는 물건 하나}`;

const SYSTEM_PROMPT_EN = `You are an astrologer who reads the weather, the season, and a person's energy to deliver today's fortune.

Rules:
- Ground the fortune in the weather, temperature, time of day, day of week, and season
- If a zodiac animal or star sign is given, weave in its energy naturally (never mention it if absent)
- If a nickname is given, address them by it once, naturally
- If age range, occupation, interests, or concerns are given, let them shape the fortune — never list the facts back
- Be specific and warm — focus on today rather than vague hopes
- Avoid definitive misfortune or warnings; offer gentle advice instead
- Never make definitive predictions about health, legal, or financial matters

Output format (exactly this, nothing else):
{2-3 sentence overall fortune, ending with 1-2 fitting emojis}
🎨 Lucky color: {color}
🔢 Lucky number: {a number from 1 to 99}
🍀 Lucky item: {one object that suits today's weather}`;

interface RequestBody {
  condition?: string;
  timeOfDay?: string;
  hour: number;
  temp: number;
  tempMin: number;
  tempMax: number;
  uvIndex?: number;
  pm10?: number;
  pm25?: number;
  rainfall?: number;
  lang?: Lang;
  // 운세 개인화 (모두 선택) — 생년월일은 받지 않는다
  profile?: {
    nickname?: string;
    ageBand?: string;
    occupation?: string;
    interests?: string;
    concern?: string;
    zodiacAnimal?: string;
    starSign?: string;
  };
}

// 코드값 → 사람이 읽는 라벨
const ANIMAL_KO: Record<string, string> = {
  rat: '쥐', ox: '소', tiger: '호랑이', rabbit: '토끼', dragon: '용', snake: '뱀',
  horse: '말', goat: '양', monkey: '원숭이', rooster: '닭', dog: '개', pig: '돼지',
};
const ANIMAL_EN: Record<string, string> = {
  rat: 'Rat', ox: 'Ox', tiger: 'Tiger', rabbit: 'Rabbit', dragon: 'Dragon', snake: 'Snake',
  horse: 'Horse', goat: 'Goat', monkey: 'Monkey', rooster: 'Rooster', dog: 'Dog', pig: 'Pig',
};
const SIGN_KO: Record<string, string> = {
  aries: '양자리', taurus: '황소자리', gemini: '쌍둥이자리', cancer: '게자리',
  leo: '사자자리', virgo: '처녀자리', libra: '천칭자리', scorpio: '전갈자리',
  sagittarius: '궁수자리', capricorn: '염소자리', aquarius: '물병자리', pisces: '물고기자리',
};
const SIGN_EN: Record<string, string> = {
  aries: 'Aries', taurus: 'Taurus', gemini: 'Gemini', cancer: 'Cancer',
  leo: 'Leo', virgo: 'Virgo', libra: 'Libra', scorpio: 'Scorpio',
  sagittarius: 'Sagittarius', capricorn: 'Capricorn', aquarius: 'Aquarius', pisces: 'Pisces',
};
const AGE_KO: Record<string, string> = {
  '10s': '10대', '20s': '20대', '30s': '30대', '40s': '40대', '50s': '50대 이상',
};
const OCC_KO: Record<string, string> = {
  student: '학생', worker: '직장인', homemaker: '주부', jobseeker: '취업준비생', etc: '기타',
};
const OCC_EN: Record<string, string> = {
  student: 'student', worker: 'office worker', homemaker: 'homemaker',
  jobseeker: 'job seeker', etc: 'other',
};

/** 프로필을 프롬프트 줄로. 값이 없거나 'private'이면 줄 자체를 만들지 않는다. */
function personaLines(lang: Lang, p?: RequestBody['profile']): string {
  if (!p) return '';
  const out: string[] = [];
  const ko = lang === 'ko';
  if (p.nickname) out.push(ko ? `- 호칭: ${p.nickname}` : `- Name: ${p.nickname}`);
  if (p.zodiacAnimal) {
    const label = ko ? ANIMAL_KO[p.zodiacAnimal] : ANIMAL_EN[p.zodiacAnimal];
    if (label) out.push(ko ? `- 띠: ${label}띠` : `- Zodiac animal: ${label}`);
  }
  if (p.starSign) {
    const label = ko ? SIGN_KO[p.starSign] : SIGN_EN[p.starSign];
    if (label) out.push(ko ? `- 별자리: ${label}` : `- Star sign: ${label}`);
  }
  if (p.ageBand && p.ageBand !== 'private') {
    const label = ko ? AGE_KO[p.ageBand] : p.ageBand;
    if (label) out.push(ko ? `- 나이대: ${label}` : `- Age range: ${label}`);
  }
  if (p.occupation) {
    const label = ko ? OCC_KO[p.occupation] : OCC_EN[p.occupation];
    if (label) out.push(ko ? `- 하는 일: ${label}` : `- Occupation: ${label}`);
  }
  if (p.interests) out.push(ko ? `- 관심사: ${p.interests}` : `- Interests: ${p.interests}`);
  if (p.concern) out.push(ko ? `- 요즘 고민: ${p.concern}` : `- Current concern: ${p.concern}`);
  return out.length > 0
    ? (ko ? `\n\n이 사람에 대해:\n${out.join('\n')}` : `\n\nAbout this person:\n${out.join('\n')}`)
    : '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await requireUser(req);
    const usage = await checkAndLog(user.id, 'fortune');
    if (!usage.ok) {
      return limitExceededResponse(usage.used, usage.limit, corsHeaders);
    }

    const body = (await req.json()) as RequestBody;

    if (!body.condition || body.temp === undefined) {
      return new Response(
        JSON.stringify({ error: 'missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const lang: Lang = body.lang === 'en' ? 'en' : 'ko';
    const kst = getKstContext(lang);
    const metrics = metricLines(lang, body);
    const condText = body.condition ? conditionLabel(lang, body.condition) : '';
    const todText = body.timeOfDay ? timeOfDayLabel(lang, body.timeOfDay) : '';

    const userPrompt =
      lang === 'ko'
        ? `오늘의 날씨 컨텍스트:
- 요일: ${kst.weekday}요일${kst.isWeekend ? ' (주말)' : ''}
- 계절: ${kst.season} (${kst.seasonHint})
- 시간대: ${todText} (${body.hour}시)
- 날씨: ${condText}
- 현재 기온: ${body.temp}°C
- 오늘 최저/최고: ${body.tempMin}°C / ${body.tempMax}°C${metrics ? '\n' + metrics : ''}

${personaLines(lang, body.profile)}

이 날씨와 계절의 에너지를 담아 오늘의 운세를 전해주세요.`
        : `Today's weather context:
- Day: ${kst.weekday}${kst.isWeekend ? ' (weekend)' : ''}
- Season: ${kst.season} (${kst.seasonHint})
- Time of day: ${todText} (${body.hour}:00)
- Weather: ${condText}
- Current temp: ${body.temp}°C
- Today's low/high: ${body.tempMin}°C / ${body.tempMax}°C${metrics ? '\n' + metrics : ''}

${personaLines(lang, body.profile)}

Channel the energy of today's weather and season into a fortune.`;

    const { text } = await callClaude({
      systemPrompt: lang === 'ko' ? SYSTEM_PROMPT_KO : SYSTEM_PROMPT_EN,
      userPrompt,
      maxTokens: 400, // 총운 + 행운 3줄
      model: MODEL_HAIKU,
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
