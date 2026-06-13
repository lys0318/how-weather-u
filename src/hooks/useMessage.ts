import { useState, useCallback } from 'react';
import { generateMessage, GeneratedMessage, MessageContext } from '../services/message';
import { WeatherInfo, getTimeOfDay, Preference } from '../constants/weather';
import { translate } from '../i18n';

interface UseMessageResult {
  message: GeneratedMessage | null;
  loading: boolean;
  error: string | null;
  generate: (weather: WeatherInfo, preference: Preference) => Promise<void>;
}

export function useMessage(): UseMessageResult {
  const [message, setMessage] = useState<GeneratedMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (weather: WeatherInfo, preference: Preference) => {
    setLoading(true);
    setError(null);

    const now = new Date();
    const ctx: MessageContext = {
      condition: weather.condition,
      timeOfDay: getTimeOfDay(now.getHours()),
      dayOfWeek: now.getDay(),
      preference,
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
