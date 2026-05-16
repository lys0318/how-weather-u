import { useState, useCallback } from 'react';
import { generateFood, FoodRecommendation } from '../services/food';
import { WeatherInfo } from '../constants/weather';

interface UseFoodResult {
  food: FoodRecommendation | null;
  loading: boolean;
  error: string | null;
  generate: (weather: WeatherInfo) => Promise<void>;
}

export function useFood(): UseFoodResult {
  const [food, setFood] = useState<FoodRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (weather: WeatherInfo) => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateFood(weather);
      setFood(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '음식 추천 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { food, loading, error, generate };
}
