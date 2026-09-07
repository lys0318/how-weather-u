import { useState, useEffect } from 'react';
import { fetchWeather, isLocationPermissionError } from '../services/weather';
import { WeatherInfo } from '../constants/weather';
import { translate } from '../i18n';

interface UseWeatherResult {
  weather: WeatherInfo | null;
  loading: boolean;
  error: string | null;
  /**
   * 위치 권한 거부로 실패한 경우에만 채워진다.
   * canAskAgain=false면 권한 재요청이 시스템에서 무시되므로,
   * 화면은 "다시 시도" 대신 설정 앱으로 보내는 버튼을 보여줘야 한다.
   */
  permissionDenied: { canAskAgain: boolean } | null;
  refetch: () => void;
}

export function useWeather(): UseWeatherResult {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState<{ canAskAgain: boolean } | null>(null);
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPermissionDenied(null);

    fetchWeather()
      .then((data) => {
        if (!cancelled) setWeather(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? translate('common.weatherFail'));
        if (isLocationPermissionError(err)) {
          setPermissionDenied({ canAskAgain: err.canAskAgain });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trigger]);

  return { weather, loading, error, permissionDenied, refetch: () => setTrigger((t) => t + 1) };
}
