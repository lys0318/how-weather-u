import { useState, useCallback } from 'react';
import { generateFortune, FortuneResult } from '../services/fortune';
import { WeatherInfo } from '../constants/weather';
import { translate } from '../i18n';

interface UseFortune {
  fortune: FortuneResult | null;
  loading: boolean;
  error: string | null;
  generate: (weather: WeatherInfo) => Promise<void>;
}

export function useFortune(): UseFortune {
  const [fortune, setFortune] = useState<FortuneResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (weather: WeatherInfo) => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateFortune(weather);
      setFortune(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.genError'));
    } finally {
      setLoading(false);
    }
  }, []);

  return { fortune, loading, error, generate };
}
