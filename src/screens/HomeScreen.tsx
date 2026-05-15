import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Share,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useWeather } from '../hooks/useWeather';
import { useMessage } from '../hooks/useMessage';
import { useOutfit } from '../hooks/useOutfit';
import { getTimeOfDay, TIME_OF_DAY_KO, DAY_OF_WEEK_KO, WeatherCondition } from '../constants/weather';
import { getPreference, saveMessage, getIntervalHours, getDndRange } from '../utils/storage';
import { Preference } from '../constants/weather';
import WeatherAnimation from '../components/WeatherAnimation';
import { refreshNotificationsIfNeeded } from '../services/notification';

const { height } = Dimensions.get('window');

// ── 낮/밤 테마 분류 ──────────────────────────────────────────
type Theme = 'day' | 'night';

function getTheme(hour: number): Theme {
  return hour >= 5 && hour < 21 ? 'day' : 'night';
}

// ── 날씨 + 시간대별 그라디언트 ───────────────────────────────
function getGradient(condition: WeatherCondition | null, hour: number): [string, string, string] {
  const timeOfDay = getTimeOfDay(hour);
  const theme = getTheme(hour);

  if (condition === 'clear') {
    if (theme === 'day') {
      if (timeOfDay === 'morning') return ['#1A4A88', '#2E72B8', '#4A9AD4']; // 아침 하늘색
      return ['#0E52A8', '#1870CC', '#2490E8'];                              // 낮 밝은 파랑
    }
    if (timeOfDay === 'evening') return ['#1a0a2e', '#3d1a5e', '#6b2d8b'];   // 저녁 보라
    return ['#050d1a', '#0a1628', '#0d2040'];                                // 밤
  }
  if (condition === 'rain' || condition === 'drizzle') {
    if (theme === 'day') return ['#2A3E52', '#3A5266', '#4A6478'];
    return ['#0d1520', '#1a2535', '#1e3045'];
  }
  if (condition === 'thunderstorm') return ['#080d14', '#111824', '#0d1520'];
  if (condition === 'snow') {
    if (theme === 'day') return ['#3A5470', '#4A6888', '#5A7EA0'];
    return ['#0d1a2e', '#1a2d42', '#1e3550'];
  }
  if (condition === 'mist') {
    if (theme === 'day') return ['#3A4A56', '#4E6070', '#607280'];
    return ['#111820', '#1a2530', '#1e2e3a'];
  }
  if (condition === 'clouds') {
    if (theme === 'day') return ['#243040', '#324454', '#405060'];
    return ['#0d1520', '#171f2e', '#1a2535'];
  }
  if (theme === 'day') return ['#1A3050', '#264068', '#305080'];
  return ['#0a0f1a', '#111824', '#141d2e'];
}

// ── 텍스트 투명도 (낮엔 좀 더 진하게) ───────────────────────
function getTextColors(hour: number) {
  const theme = getTheme(hour);
  if (theme === 'day') {
    return {
      primary:   'rgba(255,255,255,1)',
      secondary: 'rgba(255,255,255,0.85)',
      muted:     'rgba(255,255,255,0.6)',
      veryMuted: 'rgba(255,255,255,0.3)',
    };
  }
  return {
    primary:   '#ffffff',
    secondary: 'rgba(255,255,255,0.7)',
    muted:     'rgba(255,255,255,0.4)',
    veryMuted: 'rgba(255,255,255,0.15)',
  };
}

export default function HomeScreen() {
  const { weather, loading: weatherLoading, error: weatherError, refetch } = useWeather();
  const { message, loading: messageLoading, error: messageError, generate } = useMessage();
  const { outfit, loading: outfitLoading, error: outfitError, generate: generateOutfit } = useOutfit();
  const [preference, setPreference] = useState<Preference>('comfort');

  const now = new Date();
  const hour = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const timeOfDay = TIME_OF_DAY_KO[getTimeOfDay(hour)];
  const dayOfWeek = DAY_OF_WEEK_KO[now.getDay()];
  const tc = getTextColors(hour);

  const gradientColors = getGradient(weather?.condition ?? null, hour);

  useEffect(() => {
    getPreference().then(setPreference);
  }, []);

  // 앱 열 때 예약 알림 부족하면 자동 보충
  useEffect(() => {
    (async () => {
      try {
        const [iv, dnd] = await Promise.all([getIntervalHours(), getDndRange()]);
        await refreshNotificationsIfNeeded(iv, dnd.enabled, dnd.start, dnd.end);
      } catch {}
    })();
  }, []);

  // 메시지 저장 (생성될 때마다)
  useEffect(() => {
    if (message && weather) {
      saveMessage(message, weather.emoji).catch(() => {});
    }
  }, [message]);

  const handleGenerateMessage = () => {
    if (weather) generate(weather, preference);
  };

  const handleGenerateOutfit = () => {
    if (weather) generateOutfit(weather);
  };

  const handleShare = async () => {
    if (!message || !weather) return;
    await Share.share({
      message: `${weather.emoji} ${month}월 ${day}일 ${dayOfWeek} ${timeOfDay}\n\n${message.text}\n\n— 하우웨더유 (How Weather You)`,
    });
  };

  return (
    <LinearGradient colors={gradientColors} style={styles.gradient}>
      {weather && <WeatherAnimation condition={weather.condition} />}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* 날짜/시간 */}
        <View style={styles.topBar}>
          <Text style={[styles.dateText, { color: tc.primary }]}>
            {month}월 {day}일 {dayOfWeek}
          </Text>
          <Text style={[styles.timeText, { color: tc.muted }]}>
            {timeOfDay} {hour}:{minutes}
          </Text>
        </View>

        {/* 날씨 영역 */}
        {weatherLoading && (
          <View style={styles.loadingArea}>
            <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" />
            <Text style={[styles.loadingText, { color: tc.muted }]}>날씨 불러오는 중...</Text>
          </View>
        )}

        {weatherError && (
          <View style={styles.errorArea}>
            <Text style={styles.errorText}>{weatherError}</Text>
            <TouchableOpacity onPress={refetch} style={styles.retryBtn}>
              <Text style={[styles.retryText, { color: tc.secondary }]}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        )}

        {weather && !weatherLoading && (
          <View style={styles.weatherArea}>
            <Text style={styles.weatherEmoji}>{weather.emoji}</Text>
            <Text style={[styles.weatherTemp, { color: tc.primary }]}>{weather.temp}°</Text>
            <Text style={[styles.weatherTempRange, { color: tc.muted }]}>
              최저 {weather.tempMin}° / 최고 {weather.tempMax}°
            </Text>
            <Text style={[styles.weatherCondition, { color: tc.secondary }]}>{weather.conditionKo}</Text>
            <Text style={[styles.weatherCity, { color: tc.muted }]}>{weather.city}</Text>
          </View>
        )}

        {/* 감성 메시지 카드 */}
        {message && (
          <View style={styles.messageCard}>
            <Text style={styles.cardLabel}>오늘의 메시지</Text>
            <Text style={styles.messageText}>{message.text}</Text>
            <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
              <Text style={styles.shareBtnText}>공유하기 ↑</Text>
            </TouchableOpacity>
          </View>
        )}

        {messageError && (
          <View style={styles.messageErrorBox}>
            <Text style={styles.errorText}>{messageError}</Text>
          </View>
        )}

        {/* 의상 추천 카드 */}
        {outfit && (
          <View style={styles.outfitCard}>
            <Text style={styles.cardLabel}>오늘의 의상</Text>
            <Text style={styles.outfitText}>{outfit.text}</Text>
          </View>
        )}

        {outfitError && (
          <View style={styles.messageErrorBox}>
            <Text style={styles.errorText}>{outfitError}</Text>
          </View>
        )}

        {/* 버튼 영역 */}
        {weather && !weatherLoading && (
          <View style={styles.btnGroup}>
            <TouchableOpacity
              style={[styles.generateBtn, messageLoading && styles.generateBtnDisabled]}
              onPress={handleGenerateMessage}
              disabled={messageLoading}
            >
              {messageLoading ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.generateBtnText}>
                  {message ? '새 메시지 받기' : '오늘의 메시지 받기'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.outfitBtn, outfitLoading && styles.generateBtnDisabled]}
              onPress={handleGenerateOutfit}
              disabled={outfitLoading}
            >
              {outfitLoading ? (
                <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
              ) : (
                <Text style={styles.outfitBtnText}>
                  {outfit ? '👕 의상 다시 추천받기' : '👕 오늘의 의상 추천받기'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* 앱 이름 */}
        <View style={styles.appNameArea}>
          <Text style={[styles.appName, { color: tc.veryMuted }]}>하우웨더유</Text>
          <Text style={[styles.appNameEn, { color: tc.veryMuted }]}>How Weather You</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { flex: 1 },
  container: {
    minHeight: height,
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 48,
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 40,
    alignSelf: 'flex-start',
  },
  dateText: {
    fontSize: 17,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 14,
  },
  loadingArea: {
    alignItems: 'center',
    marginTop: 60,
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
  },
  weatherArea: {
    alignItems: 'center',
    marginBottom: 40,
  },
  weatherEmoji: {
    fontSize: 90,
    marginBottom: 16,
  },
  weatherTemp: {
    fontSize: 72,
    fontWeight: '200',
    letterSpacing: -2,
    lineHeight: 80,
  },
  weatherTempRange: {
    fontSize: 13,
    marginTop: 6,
    letterSpacing: 0.5,
  },
  weatherCondition: {
    fontSize: 18,
    marginTop: 8,
    fontWeight: '400',
  },
  weatherCity: {
    fontSize: 13,
    marginTop: 4,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  cardLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  messageCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20,
    padding: 22,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  messageText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 27,
    fontWeight: '300',
  },
  shareBtn: {
    alignSelf: 'flex-end',
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  shareBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  outfitCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 22,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  outfitText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 25,
    fontWeight: '300',
  },
  messageErrorBox: {
    width: '100%',
    marginBottom: 12,
  },
  btnGroup: {
    width: '100%',
    gap: 10,
    marginBottom: 12,
  },
  generateBtn: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  generateBtnDisabled: {
    opacity: 0.5,
  },
  generateBtnText: {
    color: '#0a1628',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  outfitBtn: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  outfitBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  errorArea: {
    alignItems: 'center',
    marginTop: 40,
    gap: 12,
  },
  errorText: {
    color: 'rgba(255,100,100,0.8)',
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
  },
  retryText: {
    fontSize: 14,
  },
  appNameArea: {
    alignItems: 'center',
    marginTop: 32,
  },
  appName: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 3,
  },
  appNameEn: {
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 2,
  },
});
