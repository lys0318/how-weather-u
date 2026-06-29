import { useState, useCallback } from 'react';
import { generateActivity, ActivityRecommendation } from '../services/activity';
import { WeatherInfo, Place, Social } from '../constants/weather';
import { translate } from '../i18n';

interface UseActivityResult {
  activity: ActivityRecommendation | null;
  loading: boolean;
  error: string | null;
  generate: (weather: WeatherInfo, prefs?: { place: Place; social: Social }) => Promise<void>;
}

export function useActivity(): UseActivityResult {
  const [activity, setActivity] = useState<ActivityRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (weather: WeatherInfo, prefs?: { place: Place; social: Social }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateActivity(weather, prefs);
      setActivity(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.genError'));
    } finally {
      setLoading(false);
    }
  }, []);

  return { activity, loading, error, generate };
}
