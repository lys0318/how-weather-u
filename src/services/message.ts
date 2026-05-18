import {
  WeatherCondition,
  TimeOfDay,
  Preference,
  TIME_OF_DAY_KO,
  DAY_OF_WEEK_KO,
  CONDITION_META,
} from '../constants/weather';
import { callFunction } from './backend';

export interface MessageContext {
  condition: WeatherCondition;
  timeOfDay: TimeOfDay;
  dayOfWeek: number;
  preference: Preference;
}

export interface GeneratedMessage {
  text: string;
  generatedAt: Date;
  context: MessageContext;
  used?: number;
  limit?: number;
}

export async function generateMessage(ctx: MessageContext): Promise<GeneratedMessage> {
  const meta = CONDITION_META[ctx.condition];
  const res = await callFunction('generate-message', {
    conditionKo: meta.ko,
    conditionEmoji: meta.emoji,
    timeOfDayKo: TIME_OF_DAY_KO[ctx.timeOfDay],
    dayOfWeekKo: DAY_OF_WEEK_KO[ctx.dayOfWeek],
    preference: ctx.preference,
  });

  return {
    text: res.text,
    generatedAt: new Date(),
    context: ctx,
    used: res.used,
    limit: res.limit,
  };
}
