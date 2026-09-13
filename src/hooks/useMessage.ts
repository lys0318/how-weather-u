import { useState, useCallback } from 'react';
import { generateMessage, GeneratedMessage, MessageContext } from '../services/message';
import { WeatherInfo, getTimeOfDay, Preference, MsgInputs, findTomorrow } from '../constants/weather';
import { translate } from '../i18n';

interface UseMessageResult {
  message: GeneratedMessage | null;
  loading: boolean;
  error: string | null;
  generate: (weather: WeatherInfo, preference: Preference, extras?: MsgInputs) => Promise<void>;
}

export function useMessage(): UseMessageResult {
  const [message, setMessage] = useState<GeneratedMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (weather: WeatherInfo, preference: Preference, extras?: MsgInputs) => {
    setLoading(true);
    setError(null);

    const now = new Date();
    // 저녁엔 하루 마무리 + 내일 날씨 한 조각을 곁들이도록 내일 예보를 같이 보냄
    const tm = now.getHours() >= 18 ? findTomorrow(weather, now) : undefined;
    const ctx: MessageContext = {
      condition: weather.condition,
      timeOfDay: getTimeOfDay(now.getHours()),
      dayOfWeek: now.getDay(),
      preference,
      mood: extras?.mood,
      situation: extras?.situation,
      tomorrow: tm && { condition: tm.condition, tempMin: tm.tempMin, tempMax: tm.tempMax },
    };

    try {
      const result = await generateMessage(ctx);
      setMessage(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.genError'));
    } finally {
      setLoading(false);
    }
  }, []);

  return { message, loading, error, generate };
}
