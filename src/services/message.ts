import {
  WeatherCondition,
  TimeOfDay,
  Preference,
} from '../constants/weather';
import { callFunction } from './backend';
import { getCurrentLang } from '../i18n';

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
  // 날씨/시간/요일은 enum·숫자로 전달하고, 라벨링은 서버가 lang에 맞춰 처리
  const res = await callFunction('generate-message', {
    condition: ctx.condition,
    timeOfDay: ctx.timeOfDay,
    dayOfWeek: ctx.dayOfWeek,
    preference: ctx.preference,
    lang: getCurrentLang(),
  });

  return {
    text: res.text,
    generatedAt: new Date(),
    context: ctx,
    used: res.used,
    limit: res.limit,
  };
}
