// 날씨 기반 오늘의 운세 Edge Function (ko/en)

import { corsHeaders } from '../_shared/cors.ts';
import { callClaude, MODEL_HAIKU } from '../_shared/claude.ts';
import { requireUser, checkAndLog, limitExceededResponse } from '../_shared/limit.ts';
import { getKstContext } from '../_shared/datetime.ts';
import { Lang, conditionLabel, timeOfDayLabel, metricLines } from '../_shared/labels.ts';

const SYSTEM_PROMPT_KO = `당신은 날씨와 계절을 읽어 오늘의 운세를 전해주는 점성가입니다.

규칙:
- 날씨, 기온, 시간대, 요일, 계절을 반영해 운세를 말해주세요
- 구체적이고 따뜻하게, 막연한 희망보다 오늘 하루에 집중
- 2~3문장으로 간결하게
- 마지막에 어울리는 이모지 1~2개
- 생년월일이나 별자리 없이 날씨 기반으로만
- 설명 없이 운세만 출력하세요`;

const SYSTEM_PROMPT_EN = `You are an astrologer who reads the weather and season to deliver today's fortune.

Rules:
- Reflect the weather, temperature, time of day, day of week, and season
- Be specific and warm — focus on today rather than vague hopes
- 2-3 sentences, concise
- End with 1-2 fitting emojis
- Based only on weather context, no birth dates or star signs needed
- Output only the fortune, no explanations`;

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

이 날씨와 계절의 에너지를 담아 오늘의 운세를 전해주세요. (2~3문장)`
        : `Today's weather context:
- Day: ${kst.weekday}${kst.isWeekend ? ' (weekend)' : ''}
- Season: ${kst.season} (${kst.seasonHint})
- Time of day: ${todText} (${body.hour}:00)
- Weather: ${condText}
- Current temp: ${body.temp}°C
- Today's low/high: ${body.tempMin}°C / ${body.tempMax}°C${metrics ? '\n' + metrics : ''}

Channel the energy of today's weather and season into a fortune. (2-3 sentences)`;

    const { text } = await callClaude({
      systemPrompt: lang === 'ko' ? SYSTEM_PROMPT_KO : SYSTEM_PROMPT_EN,
      userPrompt,
      maxTokens: 200,
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
