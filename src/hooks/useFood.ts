import { useState, useCallback } from 'react';
import { generateFood, FoodRecommendation } from '../services/food';
import { WeatherInfo, Cuisine } from '../constants/weather';
import { translate } from '../i18n';

interface UseFoodResult {
  food: FoodRecommendation | null;
  loading: boolean;
  error: string | null;
  generate: (weather: WeatherInfo, prefs?: { cuisine: Cuisine }) => Promise<void>;
}

export function useFood(): UseFoodResult {
  const [food, setFood] = useState<FoodRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (weather: WeatherInfo, prefs?: { cuisine: Cuisine }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateFood(weather, prefs);
      setFood(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.genError'));
    } finally {
      setLoading(false);
    }
  }, []);

  return { food, loading, error, generate };
}
