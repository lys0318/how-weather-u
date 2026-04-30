import { useState, useEffect } from 'react';
import { fetchWeather } from '../services/weather';
import { WeatherInfo } from '../constants/weather';

interface UseWeatherResult {
  weather: WeatherInfo | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWeather(): UseWeatherResult {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchWeather()
      .then((data) => {
        if (!cancelled) setWeather(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? '날씨를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trigger]);

  return { weather, loading, error, refetch: () => setTrigger((t) => t + 1) };
}
