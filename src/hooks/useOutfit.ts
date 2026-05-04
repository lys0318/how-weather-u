import { useState, useCallback } from 'react';
import { generateOutfit, OutfitRecommendation } from '../services/outfit';
import { WeatherInfo } from '../constants/weather';

interface UseOutfitResult {
  outfit: OutfitRecommendation | null;
  loading: boolean;
  error: string | null;
  generate: (weather: WeatherInfo) => Promise<void>;
}

export function useOutfit(): UseOutfitResult {
  const [outfit, setOutfit] = useState<OutfitRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (weather: WeatherInfo) => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateOutfit(weather);
      setOutfit(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '의상 추천 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { outfit, loading, error, generate };
}
