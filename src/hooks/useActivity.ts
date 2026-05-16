import { useState, useCallback } from 'react';
import { generateActivity, ActivityRecommendation } from '../services/activity';
import { WeatherInfo } from '../constants/weather';

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
      setError(err instanceof Error ? err.message : '활동 추천 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { activity, loading, error, generate };
}
