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
  Modal,
  Pressable,
  AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useWeather } from '../hooks/useWeather';
import { useMessage } from '../hooks/useMessage';
import { useActivity } from '../hooks/useActivity';
import { useFood } from '../hooks/useFood';
import {
  getTimeOfDay,
  TIME_OF_DAY_KO,
  DAY_OF_WEEK_KO,
  WeatherCondition,
  Preference,
  PREFERENCE_KO,
  PREFERENCE_EMOJI,
} from '../constants/weather';
import { saveMessage, getIntervalHours, getDndRange } from '../utils/storage';
import WeatherAnimation from '../components/WeatherAnimation';
import { refreshNotificationsIfNeeded } from '../services/notification';
import { showInterstitialThenRun } from '../services/ads';

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
      if (timeOfDay === 'morning') return ['#1A4A88', '#2E72B8', '#4A9AD4'];
      return ['#0E52A8', '#1870CC', '#2490E8'];
    }
    if (timeOfDay === 'evening') return ['#1a0a2e', '#3d1a5e', '#6b2d8b'];
    return ['#050d1a', '#0a1628', '#0d2040'];
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

const PREF_OPTIONS: { key: Preference; desc: string }[] = [
  { key: 'comfort', desc: '힘든 하루를 따뜻하게 안아주는 한마디' },
  { key: 'cheer',   desc: '에너지가 솟는 응원과 격려' },
  { key: 'advice',  desc: '날씨에 맞춰 지금 해볼만한 행동 추천' },
];

// ── 로딩 중 보여줄 재밌는 문구들 ─────────────────────────────
const LOADING_MESSAGES = [
  '오늘 날씨를 살펴보고 있어요...',
  '감성을 길어 올리는 중...',
  '단어 하나하나 골라 담는 중...',
  '하늘에 귀를 기울이는 중...',
  '당신에게 어울리는 한마디를 찾는 중...',
  '오늘에 딱 맞는 표현을 짜는 중...',
];

// ── 친절한 에러 메시지 변환 ────────────────────────────────
function prettifyError(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.includes('한도') || raw.includes('LIMIT')) {
    return '🌙 오늘의 5회를 모두 사용하셨어요.\n내일 다시 만나요!';
  }
  if (raw.includes('Network') || raw.includes('네트워크') || raw.includes('fetch')) {
    return '📡 인터넷 연결을 확인해주세요';
  }
  if (raw.includes('401') || raw.includes('인증')) {
    return '🔐 로그인이 만료됐어요. 다시 로그인해주세요';
  }
  if (raw.includes('429')) {
    return '⏳ 너무 빠르게 요청하셨어요. 잠시 후 다시 시도해주세요';
  }
  if (raw.includes('500') || raw.includes('Claude') || raw.includes('서버')) {
    return '😢 잠시 서버가 바빠요. 잠시 후 다시 시도해주세요';
  }
  return raw;
}

// ── 사용 횟수 점 시각화 ────────────────────────────────────
function UsageDots({ used, limit, color }: { used: number; limit: number; color: string }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: limit }).map((_, i) => (
        <View
          key={i}
          style={[
            dotStyles.dot,
            { backgroundColor: i < used ? color : 'transparent', borderColor: color },
          ]}
        />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.2,
  },
});

export default function HomeScreen() {
  const { weather, loading: weatherLoading, error: weatherError, refetch } = useWeather();
  const { message, loading: messageLoading, error: messageError, generate } = useMessage();
  const { activity, loading: activityLoading, error: activityError, generate: generateActivity } = useActivity();
  const { food, loading: foodLoading, error: foodError, generate: generateFood } = useFood();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [now, setNow] = useState<Date>(() => new Date());

  // ── 시간 자동 동기화 ────────────────────────────────────
  // 1) 분이 바뀔 때마다 갱신
  // 2) 앱이 백그라운드 → 포그라운드 복귀 시 즉시 갱신
  useEffect(() => {
    // 다음 분 경계에 맞춰 첫 갱신을 정렬 (UX 자연스러움)
    const msUntilNextMinute = 60_000 - (new Date().getSeconds() * 1000 + new Date().getMilliseconds());
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const firstTimer = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60_000);
    }, msUntilNextMinute);

    // 포그라운드 복귀 시 즉시 갱신
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });

    return () => {
      clearTimeout(firstTimer);
      if (intervalId) clearInterval(intervalId);
      sub.remove();
    };
  }, []);

  // 로딩 중일 때 문구 2.5초마다 회전
  const anyLoading = messageLoading || activityLoading || foodLoading;
  useEffect(() => {
    if (!anyLoading) return;
    setLoadingMsgIdx(Math.floor(Math.random() * LOADING_MESSAGES.length));
    const id = setInterval(() => {
      setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(id);
  }, [anyLoading]);
  const loadingMsg = LOADING_MESSAGES[loadingMsgIdx];

  const hour = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const timeOfDay = TIME_OF_DAY_KO[getTimeOfDay(hour)];
  const dayOfWeek = DAY_OF_WEEK_KO[now.getDay()];
  const tc = getTextColors(hour);

  const gradientColors = getGradient(weather?.condition ?? null, hour);

  // 가장 최근 응답에서 used/limit 추출 (합산 카운트)
  const latestUsage = [message, activity, food]
    .filter((x): x is NonNullable<typeof x> => !!x && typeof x.used === 'number')
    .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())[0];
  const usageText = latestUsage?.limit
    ? `오늘 ${latestUsage.used}/${latestUsage.limit}회 사용`
    : '메시지+활동+음식 합쳐 하루 5번까지';

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

  const openPicker = () => setPickerOpen(true);

  const handlePickPreference = (pref: Preference) => {
    setPickerOpen(false);
    if (!weather) return;
    showInterstitialThenRun(() => {
      generate(weather, pref);
    });
  };

  const handleGenerateActivity = () => {
    if (!weather) return;
    showInterstitialThenRun(() => {
      generateActivity(weather);
    });
  };

  const handleGenerateFood = () => {
    if (!weather) return;
    showInterstitialThenRun(() => {
      generateFood(weather);
    });
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

            {/* 추가 날씨 정보: 체감 / 습도 / 풍속 */}
            <View style={styles.weatherDetailsRow}>
              <View style={styles.weatherDetailItem}>
                <Text style={[styles.weatherDetailLabel, { color: tc.muted }]}>체감</Text>
                <Text style={[styles.weatherDetailValue, { color: tc.secondary }]}>{weather.feelsLike}°</Text>
              </View>
              <View style={styles.weatherDetailDivider} />
              <View style={styles.weatherDetailItem}>
                <Text style={[styles.weatherDetailLabel, { color: tc.muted }]}>습도</Text>
                <Text style={[styles.weatherDetailValue, { color: tc.secondary }]}>{weather.humidity}%</Text>
              </View>
              <View style={styles.weatherDetailDivider} />
              <View style={styles.weatherDetailItem}>
                <Text style={[styles.weatherDetailLabel, { color: tc.muted }]}>바람</Text>
                <Text style={[styles.weatherDetailValue, { color: tc.secondary }]}>{weather.windSpeed}m/s</Text>
              </View>
            </View>
          </View>
        )}

        {/* 로딩 중 문구 — 생성 중 어떤 거든 */}
        {anyLoading && (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
            <Text style={styles.loadingCardText}>{loadingMsg}</Text>
          </View>
        )}

        {/* 감성 메시지 카드 */}
        {message && (
          <View style={styles.messageCard}>
            <Text style={styles.cardLabel}>
              {PREFERENCE_EMOJI[message.context.preference]} {PREFERENCE_KO[message.context.preference]} 메시지
            </Text>
            <Text style={styles.messageText}>{message.text}</Text>
            <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
              <Text style={styles.shareBtnText}>공유하기 ↑</Text>
            </TouchableOpacity>
          </View>
        )}

        {messageError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTextBig}>{prettifyError(messageError)}</Text>
          </View>
        )}

        {/* 활동 추천 카드 */}
        {activity && (
          <View style={styles.activityCard}>
            <Text style={styles.cardLabel}>오늘의 활동 추천</Text>
            <Text style={styles.activityText}>{activity.text}</Text>
          </View>
        )}

        {activityError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTextBig}>{prettifyError(activityError)}</Text>
          </View>
        )}

        {/* 음식 추천 카드 */}
        {food && (
          <View style={styles.activityCard}>
            <Text style={styles.cardLabel}>오늘의 음식 추천</Text>
            <Text style={styles.activityText}>{food.text}</Text>
          </View>
        )}

        {foodError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTextBig}>{prettifyError(foodError)}</Text>
          </View>
        )}

        {/* 버튼 영역 */}
        {weather && !weatherLoading && (
          <View style={styles.btnGroup}>
            <TouchableOpacity
              style={[styles.generateBtn, messageLoading && styles.generateBtnDisabled]}
              onPress={openPicker}
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
              style={[styles.activityBtn, activityLoading && styles.generateBtnDisabled]}
              onPress={handleGenerateActivity}
              disabled={activityLoading}
            >
              {activityLoading ? (
                <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
              ) : (
                <Text style={styles.activityBtnText}>
                  {activity ? '🌈 다른 활동 추천받기' : '🌈 오늘 날씨엔 뭘 하면 좋을까?'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.activityBtn, foodLoading && styles.generateBtnDisabled]}
              onPress={handleGenerateFood}
              disabled={foodLoading}
            >
              {foodLoading ? (
                <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
              ) : (
                <Text style={styles.activityBtnText}>
                  {food ? '🍱 다른 음식 추천받기' : '🍱 오늘 같은 날씨엔 뭘 먹을까?'}
                </Text>
              )}
            </TouchableOpacity>

            {/* 사용 횟수 점 시각화 */}
            <View style={styles.usageContainer}>
              <UsageDots
                used={latestUsage?.used ?? 0}
                limit={latestUsage?.limit ?? 5}
                color={tc.muted}
              />
              <Text style={styles.limitNotice}>{usageText}</Text>
            </View>
          </View>
        )}

        {/* 앱 이름 */}
        <View style={styles.appNameArea}>
          <Text style={[styles.appName, { color: tc.veryMuted }]}>하우웨더유</Text>
          <Text style={[styles.appNameEn, { color: tc.veryMuted }]}>How Weather You</Text>
        </View>
      </ScrollView>

      {/* 메시지 유형 선택 모달 */}
      <Modal
        animationType="fade"
        transparent
        visible={pickerOpen}
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>오늘은 어떤 메시지를 받고 싶으세요?</Text>
            <Text style={styles.modalSubtitle}>지금 기분에 맞는 톤을 골라주세요</Text>

            <View style={styles.modalOptions}>
              {PREF_OPTIONS.map(({ key, desc }) => (
                <TouchableOpacity
                  key={key}
                  style={styles.optionRow}
                  onPress={() => handlePickPreference(key)}
                >
                  <Text style={styles.optionEmoji}>{PREFERENCE_EMOJI[key]}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{PREFERENCE_KO[key]}</Text>
                    <Text style={styles.optionDesc}>{desc}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setPickerOpen(false)}
            >
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  dateText: { fontSize: 17, fontWeight: '600' },
  timeText: { fontSize: 14 },
  loadingArea: { alignItems: 'center', marginTop: 60, gap: 16 },
  loadingText: { fontSize: 14 },
  weatherArea: { alignItems: 'center', marginBottom: 40 },
  weatherEmoji: { fontSize: 90, marginBottom: 16 },
  weatherTemp: { fontSize: 72, fontWeight: '200', letterSpacing: -2, lineHeight: 80 },
  weatherTempRange: { fontSize: 13, marginTop: 6, letterSpacing: 0.5 },
  weatherCondition: { fontSize: 18, marginTop: 8, fontWeight: '400' },
  weatherCity: { fontSize: 13, marginTop: 4, letterSpacing: 2, textTransform: 'uppercase' },
  cardLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.2,
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
  shareBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  activityCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 22,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  activityText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 25,
    fontWeight: '300',
  },
  messageErrorBox: { width: '100%', marginBottom: 12 },
  btnGroup: { width: '100%', gap: 10, marginBottom: 12 },
  generateBtn: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  generateBtnDisabled: { opacity: 0.5 },
  generateBtnText: {
    color: '#0a1628',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  activityBtn: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  activityBtnText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  limitNotice: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
  },
  usageContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  // 추가 날씨 정보
  weatherDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  weatherDetailItem: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  weatherDetailLabel: {
    fontSize: 10,
    letterSpacing: 1,
  },
  weatherDetailValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  weatherDetailDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  // 로딩 카드
  loadingCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  loadingCardText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    flex: 1,
    fontWeight: '300',
  },
  // 에러 카드
  errorCard: {
    width: '100%',
    backgroundColor: 'rgba(255,80,80,0.08)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,80,80,0.18)',
  },
  errorTextBig: {
    color: 'rgba(255,180,180,0.95)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  errorArea: { alignItems: 'center', marginTop: 40, gap: 12 },
  errorText: { color: 'rgba(255,100,100,0.8)', fontSize: 13, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
  },
  retryText: { fontSize: 14 },
  appNameArea: { alignItems: 'center', marginTop: 32 },
  appName: { fontSize: 14, fontWeight: '500', letterSpacing: 3 },
  appNameEn: { fontSize: 10, marginTop: 2, letterSpacing: 2 },

  // ── 모달 ─────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#161b25',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalSubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 22,
  },
  modalOptions: { gap: 10 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 16,
  },
  optionEmoji: { fontSize: 28 },
  optionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  optionDesc: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    marginTop: 2,
  },
  modalCancel: {
    marginTop: 18,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
});
