import { useState, useCallback } from 'react';
import { generateActivity, ActivityRecommendation } from '../services/activity';
import { WeatherInfo } from '../constants/weather';
import { translate } from '../i18n';

interface UseActivityResult {
  activity: ActivityRecommendation | null;
  loading: boolean;
  error: string | null;
  generate: (weather: WeatherInfo) => Promise<void>;
}

export function useActivity(): UseActivityResult {
  const [activity, setActivity] = useState<ActivityRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (weather: WeatherInfo) => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateActivity(weather);
      setActivity(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.genError'));
    } finally {
      setLoading(false);
    }
  }, []);

  return { activity, loading, error, generate };
}
