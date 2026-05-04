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
import { getTimeOfDay, TIME_OF_DAY_KO, DAY_OF_WEEK_KO, WeatherCondition } from '../constants/weather';
import { getPreference, saveMessage } from '../utils/storage';
import { Preference } from '../constants/weather';
import WeatherAnimation from '../components/WeatherAnimation';

const { height } = Dimensions.get('window');

// ── 날씨 + 시간대별 그라디언트 ───────────────────────────
function getGradient(condition: WeatherCondition | null, hour: number): [string, string, string] {
  const timeOfDay = getTimeOfDay(hour);

  if (condition === 'clear') {
    if (timeOfDay === 'morning') return ['#1a2a4a', '#2d4a7a', '#3a6494'];
    if (timeOfDay === 'afternoon') return ['#0a1628', '#1a3a6a', '#1e4d8c'];
    if (timeOfDay === 'evening') return ['#1a0a2e', '#3d1a5e', '#6b2d8b'];
    return ['#050d1a', '#0a1628', '#0d2040']; // night
  }
  if (condition === 'rain' || condition === 'drizzle') return ['#0d1520', '#1a2535', '#1e3045'];
  if (condition === 'thunderstorm') return ['#080d14', '#111824', '#0d1520'];
  if (condition === 'snow') return ['#0d1a2e', '#1a2d42', '#1e3550'];
  if (condition === 'mist') return ['#111820', '#1a2530', '#1e2e3a'];
  if (condition === 'clouds') return ['#0d1520', '#171f2e', '#1a2535'];
  // unknown / default
  return ['#0a0f1a', '#111824', '#141d2e'];
}

export default function HomeScreen() {
  const { weather, loading: weatherLoading, error: weatherError, refetch } = useWeather();
  const { message, loading: messageLoading, error: messageError, generate } = useMessage();
  const [preference, setPreference] = useState<Preference>('comfort');

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = TIME_OF_DAY_KO[getTimeOfDay(hour)];
  const dayOfWeek = DAY_OF_WEEK_KO[now.getDay()];

  const gradientColors = getGradient(weather?.condition ?? null, hour);

  useEffect(() => {
    getPreference().then(setPreference);
  }, []);

  // 날씨 로드 완료 시 첫 메시지 자동 생성
  useEffect(() => {
    if (weather && !message && !messageLoading) {
      generate(weather, preference);
    }
  }, [weather]);

  useEffect(() => {
    if (message && weather) {
      saveMessage(message, weather.emoji).catch(() => {
        // 저장 실패 시 조용히 처리 (메시지 표시는 정상 유지)
      });
    }
  }, [message]);

  const handleGenerateMessage = () => {
    if (weather) generate(weather, preference);
  };

  const handleShare = async () => {
    if (!message || !weather) return;
    await Share.share({
      message: `${weather.emoji} ${dayOfWeek} ${timeOfDay}\n\n${message.text}\n\n— 하우웨더유 (How Weather You)`,
    });
  };

  return (
    <LinearGradient colors={gradientColors} style={styles.gradient}>
      {/* 날씨 파티클 애니메이션 */}
      {weather && <WeatherAnimation condition={weather.condition} />}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* 날짜/시간 */}
        <View style={styles.topBar}>
          <Text style={styles.dateText}>{dayOfWeek}</Text>
          <Text style={styles.timeText}>{timeOfDay}</Text>
        </View>

        {/* 날씨 영역 */}
        {weatherLoading && (
          <View style={styles.loadingArea}>
            <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" />
            <Text style={styles.loadingText}>날씨 불러오는 중...</Text>
          </View>
        )}

        {weatherError && (
          <View style={styles.errorArea}>
            <Text style={styles.errorText}>{weatherError}</Text>
            <TouchableOpacity onPress={refetch} style={styles.retryBtn}>
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        )}

        {weather && !weatherLoading && (
          <View style={styles.weatherArea}>
            <Text style={styles.weatherEmoji}>{weather.emoji}</Text>
            <Text style={styles.weatherTemp}>{weather.temp}°</Text>
            <Text style={styles.weatherCondition}>{weather.conditionKo}</Text>
            <Text style={styles.weatherCity}>{weather.city}</Text>
          </View>
        )}

        {/* 메시지 카드 */}
        {message && (
          <View style={styles.messageCard}>
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

        {/* 생성 버튼 */}
        {weather && !weatherLoading && (
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
        )}

        {/* 앱 이름 */}
        <View style={styles.appNameArea}>
          <Text style={styles.appName}>하우웨더유</Text>
          <Text style={styles.appNameEn}>How Weather You</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  container: {
    minHeight: height,
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 48,
    alignItems: 'center',
  },
  // 상단 날짜
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 40,
    alignSelf: 'flex-start',
  },
  dateText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  timeText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
  },
  // 로딩
  loadingArea: {
    alignItems: 'center',
    marginTop: 60,
    gap: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
  // 날씨
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
    color: '#ffffff',
    letterSpacing: -2,
    lineHeight: 80,
  },
  weatherCondition: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
    fontWeight: '400',
  },
  weatherCity: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 4,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  // 메시지 카드
  messageCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20,
    padding: 22,
    marginBottom: 20,
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
  messageErrorBox: {
    width: '100%',
    marginBottom: 16,
  },
  // 생성 버튼
  generateBtn: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 12,
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
  // 에러
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
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  // 앱 이름
  appNameArea: {
    alignItems: 'center',
    marginTop: 32,
  },
  appName: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.15)',
    fontWeight: '500',
    letterSpacing: 3,
  },
  appNameEn: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.08)',
    marginTop: 2,
    letterSpacing: 2,
  },
});
