import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  Alert,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useWeather } from '../hooks/useWeather';
import { useMessage } from '../hooks/useMessage';
import { useActivity } from '../hooks/useActivity';
import { useFood } from '../hooks/useFood';
import {
  getTimeOfDay,
  TIME_OF_DAY_KO,
  TIME_OF_DAY_EN,
  DAY_OF_WEEK_KO,
  DAY_OF_WEEK_EN_SHORT,
  MONTH_EN_SHORT,
  WeatherCondition,
  Preference,
  PREFERENCE_KO,
  PREFERENCE_EN,
  PREFERENCE_EMOJI,
  CONDITION_META,
  uvGrade,
  airQualityGrade,
} from '../constants/weather';
import { saveMessage, saveEntry, isGuideDismissedToday, dismissGuideToday } from '../utils/storage';
import { useI18n } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import WeatherAnimation from '../components/WeatherAnimation';
import { refreshNotificationsIfNeeded } from '../services/notification';
import { showInterstitialThenRun, showRewardedAndGrant, isRewardedAvailable } from '../services/ads';
import { fetchTodayUsage, UsageInfo } from '../services/usage';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ShareableCard } from '../components/ShareableCard';

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

const PREF_ORDER: Preference[] = ['comfort', 'cheer', 'advice'];
const PREF_DESC_KEY: Record<Preference, string> = {
  comfort: 'home.prefComfortDesc',
  cheer: 'home.prefCheerDesc',
  advice: 'home.prefAdviceDesc',
};

// ── 로딩 중 보여줄 재밌는 문구 키 ────────────────────────────
const LOADING_KEYS = [
  'home.loading1', 'home.loading2', 'home.loading3',
  'home.loading4', 'home.loading5', 'home.loading6',
];

type TFn = (key: string, vars?: Record<string, string | number>) => string;

// ── 친절한 에러 메시지 변환 (언어 인지) ───────────────────────
function isLimitError(raw: string | null): boolean {
  if (!raw) return false;
  return raw.includes('한도') || raw.includes('LIMIT') || raw.includes('limit');
}
function prettifyError(raw: string | null, t: TFn): string | null {
  if (!raw) return null;
  if (isLimitError(raw)) return t('errors.limit');
  if (raw.includes('Network') || raw.includes('네트워크') || raw.includes('fetch')) {
    return t('errors.network');
  }
  if (raw.includes('401') || raw.includes('인증')) return t('errors.auth');
  if (raw.includes('429')) return t('errors.tooFast');
  if (raw.includes('500') || raw.includes('Claude') || raw.includes('서버')) {
    return t('errors.server');
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
  const { t, lang } = useI18n();
  const { isGuest } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [now, setNow] = useState<Date>(() => new Date());
  const [serverUsage, setServerUsage] = useState<UsageInfo | null>(null);

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

    // 포그라운드 복귀 시 즉시 갱신 + 사용량 재조회
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(new Date());
        fetchTodayUsage().then((u) => { if (u) setServerUsage(u); });
      }
    });

    return () => {
      clearTimeout(firstTimer);
      if (intervalId) clearInterval(intervalId);
      sub.remove();
    };
  }, []);

  // 마운트 시 오늘 사용량 즉시 조회 (메시지 생성 안 해도 잔여 횟수 표시)
  useEffect(() => {
    fetchTodayUsage().then((u) => { if (u) setServerUsage(u); });
  }, []);

  // 진입 시 사용 안내 모달 ('오늘 하루 안 보기' 안 누른 경우만)
  useEffect(() => {
    isGuideDismissedToday().then((dismissed) => {
      if (!dismissed) setGuideOpen(true);
    }).catch(() => {});
  }, []);

  const handleDismissGuideToday = useCallback(() => {
    dismissGuideToday().catch(() => {});
    setGuideOpen(false);
  }, []);

  // 로딩 중일 때 문구 2.5초마다 회전
  const anyLoading = messageLoading || activityLoading || foodLoading;
  useEffect(() => {
    if (!anyLoading) return;
    setLoadingMsgIdx(Math.floor(Math.random() * LOADING_KEYS.length));
    const id = setInterval(() => {
      setLoadingMsgIdx((i) => (i + 1) % LOADING_KEYS.length);
    }, 2500);
    return () => clearInterval(id);
  }, [anyLoading]);
  const loadingMsg = t(LOADING_KEYS[loadingMsgIdx]);

  const isEn = lang === 'en';
  const hour = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const dow = now.getDay();
  const timeOfDay = isEn ? TIME_OF_DAY_EN[getTimeOfDay(hour)] : TIME_OF_DAY_KO[getTimeOfDay(hour)];
  // 날짜 라벨: ko "6월 13일 토요일" / en "Sat, Jun 13"
  const dateText = isEn
    ? `${DAY_OF_WEEK_EN_SHORT[dow]}, ${MONTH_EN_SHORT[month - 1]} ${day}`
    : `${month}월 ${day}일 ${DAY_OF_WEEK_KO[dow]}`;
  const timeText = `${timeOfDay} ${hour}:${minutes}`;
  const tc = getTextColors(hour);

  // 공유/카드용 날짜 라벨 (시간대 포함)
  const dateLabel = isEn ? `${dateText} ${timeOfDay}` : `${dateText} ${timeOfDay}`;
  const prefLabel = (p: Preference) => (isEn ? PREFERENCE_EN[p] : PREFERENCE_KO[p]);
  const conditionLabel = (c: WeatherCondition, ko: string) => (isEn ? CONDITION_META[c].en : ko);

  const gradientColors = getGradient(weather?.condition ?? null, hour);

  // 가장 최근 응답에서 used/limit 추출 (합산 카운트)
  const latestUsage = [message, activity, food]
    .filter((x): x is NonNullable<typeof x> => !!x && typeof x.used === 'number')
    .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())[0];
  // 우선순위: 방금 생성한 응답 > 서버 조회 > fallback 안내
  const displayUsage = latestUsage?.limit
    ? { used: latestUsage.used as number, limit: latestUsage.limit as number }
    : serverUsage;
  const usageText = displayUsage
    ? t('home.usageUsed', { used: displayUsage.used, limit: displayUsage.limit })
    : t('home.usageFallback');

  // 앱 열 때 예약 알림 부족하면 자동 보충
  useEffect(() => {
    (async () => {
      try {
        await refreshNotificationsIfNeeded();
      } catch {}
    })();
  }, []);

  // 메시지 저장 (생성될 때마다) — 게스트는 저장 안 함
  useEffect(() => {
    if (message && weather && !isGuest) {
      saveMessage(message, weather.emoji).catch(() => {});
    }
  }, [message]);

  // 활동 추천 저장 — 게스트 제외
  useEffect(() => {
    if (activity && weather && !isGuest) {
      saveEntry(activity.text, weather.emoji, weather.condition, 'activity').catch(() => {});
    }
  }, [activity]);

  // 음식 추천 저장 — 게스트 제외
  useEffect(() => {
    if (food && weather && !isGuest) {
      saveEntry(food.text, weather.emoji, weather.condition, 'food').catch(() => {});
    }
  }, [food]);

  const openPicker = () => setPickerOpen(true);

  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  // 한도 초과 시 광고 본 뒤 자동 실행할 생성 동작 보관
  const pendingGenRef = useRef<(() => void) | null>(null);
  // "충전하기" 버튼으로 미리 광고 본 경우 → 다음 생성 1회는 전면 광고 생략
  const skipNextInterstitialRef = useRef(false);

  /**
   * 생성 트리거 — 광고 정책 분기
   * - 한도 이내: 전면 광고 → 생성 (종류별 당일 첫 회는 무료)
   * - 한도 초과: 자동 광고 X → 아래 "광고 보고 1회 충전하기" 버튼으로 유도
   */
  const triggerGenerate = useCallback(
    async (fn: () => void, kind: 'message' | 'activity' | 'food') => {
      const overLimit = !!displayUsage && displayUsage.used >= displayUsage.limit;

      if (overLimit) {
        // 자동으로 긴 광고를 띄우지 않고, 하단 충전 버튼으로 안내
        Alert.alert(t('home.overLimitTitle'), t('home.overLimitBody'));
        return;
      }

      if (skipNextInterstitialRef.current) {
        // 직전에 "충전하기"로 이미 광고를 봤으면 전면 광고 생략하고 바로 생성
        skipNextInterstitialRef.current = false;
        fn();
      } else {
        // 한도 이내 → 전면 광고 후 생성 (종류별 당일 첫 회는 무료)
        showInterstitialThenRun(fn, kind);
      }
    },
    [displayUsage, t],
  );

  const handlePickPreference = (pref: Preference) => {
    setPickerOpen(false);
    if (!weather) return;
    triggerGenerate(() => generate(weather, pref), 'message');
  };

  const handleGenerateActivity = () => {
    if (!weather) return;
    triggerGenerate(() => generateActivity(weather), 'activity');
  };

  const handleGenerateFood = () => {
    if (!weather) return;
    triggerGenerate(() => generateFood(weather), 'food');
  };

  // 맨 아래 "광고 보고 1회 충전하기" 전용 — 충전만 하고 자유롭게 생성하도록 (자동 생성 X)
  const handleChargeOnly = useCallback(async () => {
    if (watchingAd) return;
    setWatchingAd(true);
    try {
      const result = await showRewardedAndGrant();
      if (result) {
        setServerUsage(result);
        // 방금 광고를 봤으니, 다음 생성 1회는 전면 광고 생략
        skipNextInterstitialRef.current = true;
        Alert.alert(t('home.chargeDoneTitle'), t('home.chargeDoneFree'));
      } else {
        Alert.alert(t('home.adUnavailableTitle'), t('home.adUnavailableBodyCharge'));
      }
    } finally {
      setWatchingAd(false);
    }
  }, [watchingAd, t]);

  // (에러 카드) 광고 보고 추가 이용 → 직전 시도한 생성 자동 실행
  const handleWatchAdForCredit = useCallback(async () => {
    if (watchingAd) return;
    setWatchingAd(true);
    try {
      const result = await showRewardedAndGrant();
      if (result) {
        setServerUsage(result);
        // 직전에 시도한 생성 동작이 있으면 자동 실행 (버튼 재클릭 불필요)
        if (pendingGenRef.current) {
          pendingGenRef.current();
        } else {
          Alert.alert(
            t('home.chargeDoneTitle'),
            t('home.chargeDoneUsage', { used: result.used, limit: result.limit }),
          );
        }
      } else {
        Alert.alert(t('home.adUnavailableTitle'), t('home.adUnavailableBodyCharge'));
      }
    } finally {
      setWatchingAd(false);
    }
  }, [watchingAd, t]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // 날씨 새로 가져오기 (캐시 무시)
      await refetch();
      // 시간 갱신 (그라디언트/인사말 즉시 반영)
      setNow(new Date());
      // 오늘 사용량 재조회
      fetchTodayUsage().then((u) => { if (u) setServerUsage(u); });
      // 예약 알림 보충 시도 (실패해도 무시)
      try {
        await refreshNotificationsIfNeeded();
      } catch {}
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const handleShare = async () => {
    if (!message || !weather) return;
    setSharing(true);
    try {
      // 다음 프레임까지 대기 (카드가 완전히 렌더링되도록)
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

      // 카드 캡처
      if (!cardRef.current) throw new Error('카드 ref가 비어있어요');
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 0.95,
        result: 'tmpfile',
      });
      if (!uri) throw new Error('캡처 결과가 비어있어요');

      // 공유
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        await Share.share({
          message: `${weather.emoji} ${dateLabel}\n\n${message.text}\n\n${t('home.shareSignature')}`,
        });
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: t('home.shareDialogTitle'),
        UTI: 'public.png',
      });
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack?.slice(0, 200) ?? ''}` : String(e);
      console.error('[share] failed:', e);
      Alert.alert(t('home.shareFailTitle'), t('home.shareFailBody', { msg }));
      await Share.share({
        message: `${weather.emoji} ${dateLabel}\n\n${message.text}\n\n${t('home.shareSignature')}`,
      }).catch(() => {});
    } finally {
      setSharing(false);
    }
  };

  return (
    <LinearGradient colors={gradientColors} style={styles.gradient}>
      {weather && <WeatherAnimation condition={weather.condition} />}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="rgba(255,255,255,0.6)"
            colors={['rgba(255,255,255,0.8)']}
            progressBackgroundColor="rgba(255,255,255,0.1)"
          />
        }
      >
        {/* 날짜/시간 */}
        <View style={styles.topBar}>
          <Text style={[styles.dateText, { color: tc.primary }]}>
            {dateText}
          </Text>
          <Text style={[styles.timeText, { color: tc.muted }]}>
            {timeText}
          </Text>
        </View>

        {/* 게스트 안내 배너 */}
        {isGuest && (
          <View style={styles.guestBanner}>
            <Text style={styles.guestBannerText}>👤 {t('home.guestBanner')}</Text>
          </View>
        )}

        {/* 날씨 영역 */}
        {weatherLoading && (
          <View style={styles.loadingArea}>
            <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" />
            <Text style={[styles.loadingText, { color: tc.muted }]}>{t('home.weatherLoading')}</Text>
          </View>
        )}

        {weatherError && (
          <View style={styles.errorArea}>
            <Text style={styles.errorText}>{weatherError}</Text>
            <TouchableOpacity onPress={refetch} style={styles.retryBtn}>
              <Text style={[styles.retryText, { color: tc.secondary }]}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {weather && !weatherLoading && (
          <View style={styles.weatherArea}>
            <Text style={styles.weatherEmoji}>{weather.emoji}</Text>
            <Text style={[styles.weatherTemp, { color: tc.primary }]}>{weather.temp}°</Text>
            <Text style={[styles.weatherTempRange, { color: tc.muted }]}>
              {t('weather.tempRange', { min: weather.tempMin, max: weather.tempMax })}
            </Text>
            <Text style={[styles.weatherCondition, { color: tc.secondary }]}>
              {conditionLabel(weather.condition, weather.conditionKo)}
            </Text>
            <Text style={[styles.weatherCity, { color: tc.muted }]}>
              {weather.city && weather.city !== '내 위치' ? weather.city : t('weather.myLocation')}
            </Text>

            {/* 추가 날씨 정보: 체감 / 습도 / 풍속 */}
            <View style={styles.weatherDetailsRow}>
              <View style={styles.weatherDetailItem}>
                <Text style={[styles.weatherDetailLabel, { color: tc.muted }]}>{t('weather.feelsLike')}</Text>
                <Text style={[styles.weatherDetailValue, { color: tc.secondary }]}>{weather.feelsLike}°</Text>
              </View>
              <View style={styles.weatherDetailDivider} />
              <View style={styles.weatherDetailItem}>
                <Text style={[styles.weatherDetailLabel, { color: tc.muted }]}>{t('weather.humidity')}</Text>
                <Text style={[styles.weatherDetailValue, { color: tc.secondary }]}>{weather.humidity}%</Text>
              </View>
              <View style={styles.weatherDetailDivider} />
              <View style={styles.weatherDetailItem}>
                <Text style={[styles.weatherDetailLabel, { color: tc.muted }]}>{t('weather.wind')}</Text>
                <Text style={[styles.weatherDetailValue, { color: tc.secondary }]}>{weather.windSpeed}m/s</Text>
              </View>
            </View>

            {/* 추가 지표: 자외선 / 미세먼지 / 강수량 (값 있을 때만) */}
            {(weather.uvIndex !== undefined ||
              weather.pm10 !== undefined ||
              weather.pm25 !== undefined ||
              weather.rainfall !== undefined) && (
              <View style={[styles.weatherDetailsRow, { marginTop: 10 }]}>
                <View style={styles.weatherDetailItem}>
                  <Text style={[styles.weatherDetailLabel, { color: tc.muted }]}>{t('weather.uv')}</Text>
                  <Text style={[styles.weatherDetailValue, { color: tc.secondary }]}>
                    {weather.uvIndex !== undefined
                      ? `${Math.round(weather.uvIndex)} · ${isEn ? uvGrade(weather.uvIndex).en : uvGrade(weather.uvIndex).ko}`
                      : '—'}
                  </Text>
                </View>
                <View style={styles.weatherDetailDivider} />
                <View style={styles.weatherDetailItem}>
                  <Text style={[styles.weatherDetailLabel, { color: tc.muted }]}>{t('weather.dust')}</Text>
                  <Text style={[styles.weatherDetailValue, { color: tc.secondary }]}>
                    {(() => {
                      const g = airQualityGrade(weather.pm10, weather.pm25);
                      return g ? (isEn ? g.en : g.ko) : '—';
                    })()}
                  </Text>
                </View>
                <View style={styles.weatherDetailDivider} />
                <View style={styles.weatherDetailItem}>
                  <Text style={[styles.weatherDetailLabel, { color: tc.muted }]}>{t('weather.rain')}</Text>
                  <Text style={[styles.weatherDetailValue, { color: tc.secondary }]}>
                    {weather.rainfall && weather.rainfall > 0
                      ? `${weather.rainfall}mm`
                      : t('weather.noRain')}
                  </Text>
                </View>
              </View>
            )}
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
              {t('home.messageLabel', {
                emoji: PREFERENCE_EMOJI[message.context.preference],
                tone: prefLabel(message.context.preference),
              })}
            </Text>
            <Text style={styles.messageText}>{message.text}</Text>
            <TouchableOpacity
              onPress={handleShare}
              style={styles.shareBtn}
              disabled={sharing}
            >
              {sharing ? (
                <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
              ) : (
                <Text style={styles.shareBtnText}>{t('home.shareUp')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* 공유용 카드 — opacity 0 으로 안 보이지만 렌더링됨 (캡처용) */}
        {message && weather && (
          <ShareableCard
            ref={cardRef}
            text={message.text}
            weatherEmoji={weather.emoji}
            conditionKo={conditionLabel(weather.condition, weather.conditionKo)}
            dateLabel={dateLabel}
            toneLabel={t('home.messageLabel', {
              emoji: PREFERENCE_EMOJI[message.context.preference],
              tone: prefLabel(message.context.preference),
            })}
            condition={weather.condition}
          />
        )}

        {messageError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTextBig}>{prettifyError(messageError, t)}</Text>
            {isLimitError(messageError) && (
              <TouchableOpacity
                style={[styles.rewardAdBtn, { marginTop: 16 }, watchingAd && styles.generateBtnDisabled]}
                onPress={handleWatchAdForCredit}
                disabled={watchingAd}
              >
                {watchingAd ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.rewardAdBtnText}>{t('home.watchAdMore')}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* 활동 추천 카드 */}
        {activity && (
          <View style={styles.activityCard}>
            <Text style={styles.cardLabel}>{t('home.activityLabel')}</Text>
            <Text style={styles.activityText}>{activity.text}</Text>
          </View>
        )}

        {activityError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTextBig}>{prettifyError(activityError, t)}</Text>
            {isLimitError(activityError) && (
              <TouchableOpacity
                style={[styles.rewardAdBtn, { marginTop: 16 }, watchingAd && styles.generateBtnDisabled]}
                onPress={handleWatchAdForCredit}
                disabled={watchingAd}
              >
                {watchingAd ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.rewardAdBtnText}>{t('home.watchAdMore')}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* 음식 추천 카드 */}
        {food && (
          <View style={styles.activityCard}>
            <Text style={styles.cardLabel}>{t('home.foodLabel')}</Text>
            <Text style={styles.activityText}>{food.text}</Text>
          </View>
        )}

        {foodError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTextBig}>{prettifyError(foodError, t)}</Text>
            {isLimitError(foodError) && (
              <TouchableOpacity
                style={[styles.rewardAdBtn, { marginTop: 16 }, watchingAd && styles.generateBtnDisabled]}
                onPress={handleWatchAdForCredit}
                disabled={watchingAd}
              >
                {watchingAd ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.rewardAdBtnText}>{t('home.watchAdMore')}</Text>
                )}
              </TouchableOpacity>
            )}
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
                  {message ? t('home.getAnotherMessage') : t('home.getMessage')}
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
                  {activity ? t('home.activityAnother') : t('home.activityCta')}
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
                  {food ? t('home.foodAnother') : t('home.foodCta')}
                </Text>
              )}
            </TouchableOpacity>

            {/* 사용 횟수 점 시각화 */}
            <View style={styles.usageContainer}>
              <UsageDots
                used={displayUsage?.used ?? 0}
                limit={displayUsage?.limit ?? 3}
                color={tc.muted}
              />
              <Text style={styles.limitNotice}>{usageText}</Text>

              {/* 한도 도달 시 — 광고 보고 충전 (충전만, 이후 자유롭게 생성) */}
              {displayUsage && displayUsage.used >= displayUsage.limit && (
                <TouchableOpacity
                  style={[styles.rewardAdBtn, watchingAd && styles.generateBtnDisabled]}
                  onPress={handleChargeOnly}
                  disabled={watchingAd}
                >
                  {watchingAd ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.rewardAdBtnText}>
                      {t('home.chargeOne')}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
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
            <Text style={styles.modalTitle}>{t('home.tonePickTitle')}</Text>
            <Text style={styles.modalSubtitle}>{t('home.tonePickSubtitle')}</Text>

            <View style={styles.modalOptions}>
              {PREF_ORDER.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={styles.optionRow}
                  onPress={() => handlePickPreference(key)}
                >
                  <Text style={styles.optionEmoji}>{PREFERENCE_EMOJI[key]}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{prefLabel(key)}</Text>
                    <Text style={styles.optionDesc}>{t(PREF_DESC_KEY[key])}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setPickerOpen(false)}
            >
              <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 사용 안내 모달 (진입 시 1회, '오늘 하루 안 보기'로 끔) */}
      <Modal
        animationType="fade"
        transparent
        visible={guideOpen}
        onRequestClose={() => setGuideOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setGuideOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t('guide.title')}</Text>
            <View style={styles.guideList}>
              <Text style={styles.guideLine}>• {t('guide.line1')}</Text>
              <Text style={styles.guideLine}>• {t('guide.line2')}</Text>
              <Text style={styles.guideLine}>• {t('guide.line3')}</Text>
              <Text style={styles.guideLine}>• {t('guide.line4')}</Text>
            </View>
            <TouchableOpacity style={styles.guideGotIt} onPress={() => setGuideOpen(false)}>
              <Text style={styles.guideGotItText}>{t('guide.gotIt')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={handleDismissGuideToday}>
              <Text style={styles.modalCancelText}>{t('guide.dontShowToday')}</Text>
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
  // 게스트 배너
  guestBanner: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  guestBannerText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12.5,
    textAlign: 'center',
  },
  // 사용 안내 모달
  guideList: {
    gap: 12,
    marginBottom: 8,
  },
  guideLine: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14.5,
    lineHeight: 21,
  },
  guideGotIt: {
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  guideGotItText: {
    color: '#0a1628',
    fontSize: 15,
    fontWeight: '700',
  },
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
  rewardAdBtn: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  rewardAdBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
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
