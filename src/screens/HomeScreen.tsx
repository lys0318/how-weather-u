import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Share,
  Modal,
  Pressable,
  AppState,
  Alert,
  RefreshControl,
} from 'react-native';
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
  ForecastSlot,
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
import { refreshNotificationsIfNeeded } from '../services/notification';
import { showInterstitialThenRun, showRewardedAndGrant } from '../services/ads';
import { fetchTodayUsage, UsageInfo } from '../services/usage';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ShareableCard } from '../components/ShareableCard';
import { COLORS, FONTS, RADII } from '../constants/theme';
import SkyBackground, { getSkyKind, getPaperTint } from '../components/SkyBackground';
import WeatherAnimation from '../components/WeatherAnimation';
import { useFocusEffect } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';

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
function UsageDots({ used, limit }: { used: number; limit: number }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: limit }).map((_, i) => (
        <View key={i} style={[dotStyles.dot, i < used ? dotStyles.dotOn : dotStyles.dotOff]} />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 9, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.4 },
  dotOn: { backgroundColor: COLORS.ember, borderColor: COLORS.ember },
  dotOff: { backgroundColor: 'transparent', borderColor: COLORS.ink3 },
});

// 향후 예보에서 비 올 슬롯을 찾아 "N시간 뒤 / 확률" 계산
function computeUmbrella(
  forecast: ForecastSlot[] | undefined,
  hour: number,
): { hours: number; pct: number } | null {
  if (!forecast || forecast.length === 0) return null;
  for (const slot of forecast) {
    const rainy =
      slot.condition === 'rain' || slot.condition === 'drizzle' || slot.condition === 'thunderstorm';
    if (rainy || slot.pop >= 0.3) {
      let h = slot.hour - hour;
      if (h < 0) h += 24;
      return { hours: h, pct: Math.round(slot.pop * 100) };
    }
  }
  return null;
}

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

  // 홈은 하늘 위 — 밝은 상태바
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
    }, []),
  );

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
  const timeText = `${timeOfDay} · ${hour}:${minutes}`;

  // 공유/카드용 날짜 라벨 (시간대 포함)
  const dateLabel = `${dateText} ${timeOfDay}`;
  const prefLabel = (p: Preference) => (isEn ? PREFERENCE_EN[p] : PREFERENCE_KO[p]);
  const conditionLabel = (c: WeatherCondition, ko: string) => (isEn ? CONDITION_META[c].en : ko);
  // 편지 톤 태그: ko "위로 · COMFORT" / en "COMFORT"
  const toneTag = (p: Preference) =>
    isEn ? PREFERENCE_EN[p].toUpperCase() : `${PREFERENCE_KO[p]} · ${PREFERENCE_EN[p].toUpperCase()}`;

  const skyKind = getSkyKind(weather?.condition ?? null, hour);
  const paper = getPaperTint(skyKind);

  // 비 예보 시 우산 안내
  const umbrella = computeUmbrella(weather?.forecast, hour);
  const umbrellaText = umbrella
    ? umbrella.pct >= 10
      ? umbrella.hours <= 0
        ? t('home.umbrellaSoon', { pct: umbrella.pct })
        : t('home.umbrellaH', { hours: umbrella.hours, pct: umbrella.pct })
      : umbrella.hours <= 0
        ? t('home.umbrellaSoonNoPct')
        : t('home.umbrellaHNoPct', { hours: umbrella.hours })
    : null;

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
    async (fn: () => void) => {
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
        // 한도 이내 → 하루 첫 생성은 무료, 2·3회차는 짧은 전면 광고 후 생성
        showInterstitialThenRun(fn);
      }
    },
    [displayUsage, t],
  );

  const handlePickPreference = (pref: Preference) => {
    setPickerOpen(false);
    if (!weather) return;
    triggerGenerate(() => generate(weather, pref));
  };

  const handleGenerateActivity = () => {
    if (!weather) return;
    triggerGenerate(() => generateActivity(weather));
  };

  const handleGenerateFood = () => {
    if (!weather) return;
    triggerGenerate(() => generateFood(weather));
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

  const overLimit = !!displayUsage && displayUsage.used >= displayUsage.limit;

  return (
    <View style={[styles.root, { backgroundColor: paper }]}>
      <ScrollView
        style={[styles.scroll, { backgroundColor: paper }]}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.ink3}
            colors={[COLORS.ember]}
            progressBackgroundColor={COLORS.card}
          />
        }
      >
        {/* ─── HERO (수채 하늘) ─── */}
        <View style={styles.hero}>
          <SkyBackground kind={skyKind} />
          {weather && <WeatherAnimation condition={weather.condition} />}

          <View style={styles.topBar}>
            <Text style={styles.heroDate}>{dateText}</Text>
            <Text style={styles.heroTime}>{timeText}</Text>
          </View>

          {weatherLoading && (
            <View style={styles.loadingArea}>
              <ActivityIndicator color={COLORS.skyText2} size="large" />
              <Text style={styles.loadingTextSky}>{t('home.weatherLoading')}</Text>
            </View>
          )}

          {weatherError && (
            <View style={styles.errorArea}>
              <Text style={styles.errorTextSky}>{weatherError}</Text>
              <TouchableOpacity onPress={refetch} style={styles.retryBtn}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {weather && !weatherLoading && (
            <View style={styles.wx}>
              <Text style={styles.wxStamp}>{weather.emoji}</Text>
              <Text style={styles.wxTemp}>{weather.temp}°</Text>
              <Text style={styles.wxRange}>
                {t('weather.tempRange', { min: weather.tempMin, max: weather.tempMax })}
              </Text>
              <Text style={styles.wxCond}>{conditionLabel(weather.condition, weather.conditionKo)}</Text>
              <Text style={styles.wxCity}>
                {weather.city && weather.city !== '내 위치' ? weather.city : t('weather.myLocation')}
              </Text>

              {/* 체감 / 습도 / 바람 — 유리 스트립 */}
              <View style={styles.glassRow}>
                <View style={styles.glassCell}>
                  <Text style={styles.glassK}>{t('weather.feelsLike')}</Text>
                  <Text style={styles.glassV}>{weather.feelsLike}°</Text>
                </View>
                <View style={styles.glassDivider} />
                <View style={styles.glassCell}>
                  <Text style={styles.glassK}>{t('weather.humidity')}</Text>
                  <Text style={styles.glassV}>{weather.humidity}%</Text>
                </View>
                <View style={styles.glassDivider} />
                <View style={styles.glassCell}>
                  <Text style={styles.glassK}>{t('weather.wind')}</Text>
                  <Text style={styles.glassV}>{weather.windSpeed}㎧</Text>
                </View>
              </View>

              {/* 자외선 / 미세먼지 / 강수 (값 있을 때만) */}
              {(weather.uvIndex !== undefined ||
                weather.pm10 !== undefined ||
                weather.pm25 !== undefined ||
                weather.rainfall !== undefined) && (
                <View style={[styles.glassRow, { marginTop: 8 }]}>
                  <View style={styles.glassCell}>
                    <Text style={styles.glassK}>{t('weather.uv')}</Text>
                    <Text style={styles.glassV}>
                      {weather.uvIndex !== undefined
                        ? `${Math.round(weather.uvIndex)} · ${isEn ? uvGrade(weather.uvIndex).en : uvGrade(weather.uvIndex).ko}`
                        : '—'}
                    </Text>
                  </View>
                  <View style={styles.glassDivider} />
                  <View style={styles.glassCell}>
                    <Text style={styles.glassK}>{t('weather.dust')}</Text>
                    <Text style={styles.glassV}>
                      {(() => {
                        const g = airQualityGrade(weather.pm10, weather.pm25);
                        return g ? (isEn ? g.en : g.ko) : '—';
                      })()}
                    </Text>
                  </View>
                  <View style={styles.glassDivider} />
                  <View style={styles.glassCell}>
                    <Text style={styles.glassK}>{t('weather.rain')}</Text>
                    <Text style={styles.glassV}>
                      {weather.rainfall && weather.rainfall > 0
                        ? `${weather.rainfall}mm`
                        : t('weather.noRain')}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ─── 페이퍼 본문 ─── */}
        <View style={[styles.body, { backgroundColor: paper }]}>
          {/* 비 예보 — 우산 안내 */}
          {umbrellaText && (
            <View style={styles.umbrella}>
              <Text style={styles.umbrellaText}>{umbrellaText}</Text>
            </View>
          )}

          {/* 게스트 안내 배너 */}
          {isGuest && (
            <View style={styles.guestBanner}>
              <Text style={styles.guestBannerText}>👤 {t('home.guestBanner')}</Text>
            </View>
          )}

          {/* 로딩 중 문구 */}
          {anyLoading && (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={COLORS.ember} size="small" />
              <Text style={styles.loadingCardText}>{loadingMsg}</Text>
            </View>
          )}

          {/* 감성 메시지 — 편지 노트 */}
          {message && (
            <View style={styles.note}>
              <View style={styles.noteTag}>
                <Text style={styles.noteTagEmoji}>{PREFERENCE_EMOJI[message.context.preference]}</Text>
                <Text style={styles.noteTagText}>{toneTag(message.context.preference)}</Text>
              </View>
              <Text style={styles.noteQuote}>“</Text>
              <Text style={styles.noteText}>{message.text}</Text>
              <View style={styles.noteFoot}>
                <Text style={styles.noteSign}>{t('home.shareSignature')}</Text>
                <TouchableOpacity onPress={handleShare} style={styles.noteShare} disabled={sharing}>
                  {sharing ? (
                    <ActivityIndicator color={COLORS.ink2} size="small" />
                  ) : (
                    <Text style={styles.noteShareText}>{t('home.shareUp')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 공유용 카드 — 캡처 전용 (화면엔 영향 없음) */}
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
                  style={[styles.rewardAdBtn, watchingAd && styles.btnDisabled]}
                  onPress={handleWatchAdForCredit}
                  disabled={watchingAd}
                >
                  {watchingAd ? (
                    <ActivityIndicator color={COLORS.emberText} size="small" />
                  ) : (
                    <Text style={styles.rewardAdBtnText}>{t('home.watchAdMore')}</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 활동 추천 */}
          {activity && (
            <View style={styles.recCard}>
              <View style={styles.recIco}>
                <Text style={styles.recIcoText}>🌿</Text>
              </View>
              <View style={styles.recBody}>
                <Text style={styles.recKicker}>{t('home.activityLabel')}</Text>
                <Text style={styles.recText}>{activity.text}</Text>
              </View>
            </View>
          )}

          {activityError && (
            <View style={styles.errorCard}>
              <Text style={styles.errorTextBig}>{prettifyError(activityError, t)}</Text>
              {isLimitError(activityError) && (
                <TouchableOpacity
                  style={[styles.rewardAdBtn, watchingAd && styles.btnDisabled]}
                  onPress={handleWatchAdForCredit}
                  disabled={watchingAd}
                >
                  {watchingAd ? (
                    <ActivityIndicator color={COLORS.emberText} size="small" />
                  ) : (
                    <Text style={styles.rewardAdBtnText}>{t('home.watchAdMore')}</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 음식 추천 */}
          {food && (
            <View style={styles.recCard}>
              <View style={styles.recIco}>
                <Text style={styles.recIcoText}>🍵</Text>
              </View>
              <View style={styles.recBody}>
                <Text style={styles.recKicker}>{t('home.foodLabel')}</Text>
                <Text style={styles.recText}>{food.text}</Text>
              </View>
            </View>
          )}

          {foodError && (
            <View style={styles.errorCard}>
              <Text style={styles.errorTextBig}>{prettifyError(foodError, t)}</Text>
              {isLimitError(foodError) && (
                <TouchableOpacity
                  style={[styles.rewardAdBtn, watchingAd && styles.btnDisabled]}
                  onPress={handleWatchAdForCredit}
                  disabled={watchingAd}
                >
                  {watchingAd ? (
                    <ActivityIndicator color={COLORS.emberText} size="small" />
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
                style={[styles.primaryBtn, messageLoading && styles.btnDisabled]}
                onPress={openPicker}
                disabled={messageLoading}
              >
                {messageLoading ? (
                  <ActivityIndicator color={COLORS.emberText} size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {message ? t('home.getAnotherMessage') : t('home.getMessage')}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ghostBtn, activityLoading && styles.btnDisabled]}
                onPress={handleGenerateActivity}
                disabled={activityLoading}
              >
                {activityLoading ? (
                  <ActivityIndicator color={COLORS.ink2} size="small" />
                ) : (
                  <Text style={styles.ghostBtnText}>
                    {activity ? t('home.activityAnother') : t('home.activityCta')}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ghostBtn, foodLoading && styles.btnDisabled]}
                onPress={handleGenerateFood}
                disabled={foodLoading}
              >
                {foodLoading ? (
                  <ActivityIndicator color={COLORS.ink2} size="small" />
                ) : (
                  <Text style={styles.ghostBtnText}>
                    {food ? t('home.foodAnother') : t('home.foodCta')}
                  </Text>
                )}
              </TouchableOpacity>

              {/* 사용 횟수 점 시각화 */}
              <View style={styles.usageContainer}>
                <UsageDots used={displayUsage?.used ?? 0} limit={displayUsage?.limit ?? 3} />
                <Text style={styles.usageText}>{usageText}</Text>

                {/* 한도 도달 시 — 광고 보고 충전 */}
                {overLimit && (
                  <TouchableOpacity
                    style={[styles.chargeBtn, watchingAd && styles.btnDisabled]}
                    onPress={handleChargeOnly}
                    disabled={watchingAd}
                  >
                    {watchingAd ? (
                      <ActivityIndicator color={COLORS.emberText} size="small" />
                    ) : (
                      <Text style={styles.chargeBtnText}>{t('home.chargeOne')}</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* 앱 이름 */}
          <View style={styles.appNameArea}>
            <Text style={styles.appName}>하우웨더유</Text>
            <Text style={styles.appNameEn}>HOW WEATHER YOU</Text>
          </View>
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
            <View style={styles.sheetGrip} />
            <Text style={styles.modalTitle}>{t('home.tonePickTitle')}</Text>
            <Text style={styles.modalSubtitle}>{t('home.tonePickSubtitle')}</Text>

            <View style={styles.modalOptions}>
              {PREF_ORDER.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={styles.optionRow}
                  onPress={() => handlePickPreference(key)}
                >
                  <View style={styles.optionIco}>
                    <Text style={styles.optionEmoji}>{PREFERENCE_EMOJI[key]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{prefLabel(key)}</Text>
                    <Text style={styles.optionDesc}>{t(PREF_DESC_KEY[key])}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.modalCancel} onPress={() => setPickerOpen(false)}>
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
            <View style={styles.sheetGrip} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { flex: 1, backgroundColor: COLORS.paper },
  container: { paddingBottom: 44 },

  // ─── HERO ───
  hero: {
    paddingTop: 54,
    paddingBottom: 54,
    paddingHorizontal: 26,
    overflow: 'hidden',
  },
  topBar: { gap: 4 },
  heroDate: {
    fontFamily: FONTS.serifKoBold,
    fontSize: 18,
    color: COLORS.skyText,
    letterSpacing: 0.2,
  },
  heroTime: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.skyText3,
    letterSpacing: 0.4,
  },
  wx: { alignItems: 'center', marginTop: 22 },
  wxStamp: { fontSize: 40, lineHeight: 46 },
  wxTemp: {
    fontFamily: FONTS.serifEnLight,
    fontSize: 86,
    lineHeight: 92,
    color: COLORS.skyText,
    letterSpacing: -2,
    marginTop: 6,
  },
  wxRange: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.skyText2,
    letterSpacing: 0.6,
    marginTop: 6,
  },
  wxCond: {
    fontFamily: FONTS.serifKo,
    fontSize: 19,
    color: COLORS.skyText,
    marginTop: 10,
  },
  wxCity: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.skyText3,
    letterSpacing: 2,
    marginTop: 7,
  },
  glassRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    marginTop: 22,
    backgroundColor: COLORS.skyGlass,
    borderWidth: 1,
    borderColor: COLORS.skyGlassLine,
    borderRadius: 14,
    overflow: 'hidden',
  },
  glassCell: { flex: 1, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 4 },
  glassDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  glassK: { fontSize: 10.5, color: COLORS.skyText3, letterSpacing: 0.4 },
  glassV: {
    fontFamily: FONTS.monoMedium,
    fontSize: 15,
    color: COLORS.skyText,
    marginTop: 3,
  },

  // ─── 페이퍼 본문 ───
  body: { paddingHorizontal: 26, paddingTop: 4 },

  umbrella: {
    backgroundColor: COLORS.emberSoft,
    borderRadius: RADII.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(194,104,63,0.25)',
  },
  umbrellaText: {
    color: COLORS.emberD,
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  guestBanner: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  guestBannerText: { color: COLORS.ink2, fontSize: 12.5, textAlign: 'center' },

  loadingCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  loadingCardText: { color: COLORS.ink2, fontSize: 13, flex: 1 },

  loadingArea: { alignItems: 'center', marginTop: 50, gap: 14 },
  loadingTextSky: { fontSize: 14, color: COLORS.skyText2 },
  errorArea: { alignItems: 'center', marginTop: 40, gap: 12 },
  errorTextSky: { color: COLORS.skyText, fontSize: 13, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: COLORS.skyGlass,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.skyGlassLine,
  },
  retryText: { fontSize: 14, color: COLORS.skyText },

  // 편지 노트
  note: {
    backgroundColor: COLORS.noteTop,
    borderRadius: RADII.note,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    marginBottom: 14,
    shadowColor: '#2B2620',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 3,
  },
  noteTag: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  notePip: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.ember },
  noteTagEmoji: { fontSize: 13 },
  noteTagText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    color: COLORS.emberD,
  },
  noteQuote: {
    fontFamily: FONTS.serifEn,
    fontSize: 40,
    lineHeight: 30,
    color: COLORS.paper3,
    marginTop: 4,
    height: 22,
  },
  noteText: {
    fontFamily: FONTS.serifKo,
    fontSize: 18,
    lineHeight: 32,
    color: COLORS.ink,
    letterSpacing: -0.2,
  },
  noteFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.line2,
  },
  noteSign: { fontFamily: FONTS.serifKo, fontSize: 13, color: COLORS.ink3, fontStyle: 'italic' },
  noteShare: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: COLORS.paper,
  },
  noteShareText: { fontSize: 12.5, fontWeight: '600', color: COLORS.ink2 },

  // 활동/음식 추천 카드
  recCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  recIco: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.paper3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recIcoText: { fontSize: 17 },
  recBody: { flex: 1 },
  recKicker: {
    fontSize: 11,
    letterSpacing: 1,
    color: COLORS.ink3,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  recText: { fontFamily: FONTS.serifKo, fontSize: 15.5, lineHeight: 27, color: COLORS.ink },

  // 버튼
  btnGroup: { gap: 10, marginTop: 2 },
  primaryBtn: {
    backgroundColor: COLORS.ember,
    borderRadius: RADII.btn,
    paddingVertical: 17,
    alignItems: 'center',
  },
  primaryBtnText: { color: COLORS.emberText, fontSize: 15.5, fontWeight: '600', letterSpacing: 0.2 },
  ghostBtn: {
    backgroundColor: 'transparent',
    borderRadius: RADII.btn,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  ghostBtnText: { color: COLORS.ink2, fontSize: 15, fontWeight: '500' },
  btnDisabled: { opacity: 0.5 },

  usageContainer: { alignItems: 'center', marginTop: 14, gap: 2 },
  usageText: { fontFamily: FONTS.mono, fontSize: 11.5, color: COLORS.ink3, marginTop: 9 },
  chargeBtn: {
    marginTop: 14,
    backgroundColor: COLORS.ember,
    borderRadius: RADII.btn,
    paddingVertical: 13,
    paddingHorizontal: 24,
  },
  chargeBtnText: { color: COLORS.emberText, fontSize: 14, fontWeight: '600' },
  rewardAdBtn: {
    marginTop: 14,
    backgroundColor: COLORS.ember,
    borderRadius: RADII.btn,
    paddingVertical: 12,
    paddingHorizontal: 22,
    alignSelf: 'center',
  },
  rewardAdBtnText: { color: COLORS.emberText, fontSize: 14, fontWeight: '600' },

  errorCard: {
    backgroundColor: 'rgba(178,91,76,0.08)',
    borderRadius: RADII.card,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(178,91,76,0.22)',
    alignItems: 'center',
  },
  errorTextBig: { color: COLORS.danger, fontSize: 14, lineHeight: 21, textAlign: 'center' },

  appNameArea: { alignItems: 'center', marginTop: 30 },
  appName: { fontFamily: FONTS.serifKo, fontSize: 14, color: COLORS.ink3, letterSpacing: 2 },
  appNameEn: { fontFamily: FONTS.mono, fontSize: 9.5, color: COLORS.ink3, letterSpacing: 2, marginTop: 4, opacity: 0.7 },

  // ─── 모달 (페이퍼 시트) ───
  modalOverlay: { flex: 1, backgroundColor: 'rgba(28,22,30,0.42)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: RADII.sheet,
    borderTopRightRadius: RADII.sheet,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 34,
  },
  sheetGrip: {
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: COLORS.line,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontFamily: FONTS.serifKo, color: COLORS.ink, fontSize: 21, textAlign: 'center' },
  modalSubtitle: { color: COLORS.ink3, fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 22 },
  modalOptions: { gap: 11 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 17,
    borderRadius: RADII.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    gap: 15,
  },
  optionIco: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.paper3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionEmoji: { fontSize: 20 },
  optionTitle: { fontFamily: FONTS.serifKoBold, color: COLORS.ink, fontSize: 16 },
  optionDesc: { color: COLORS.ink3, fontSize: 12.5, marginTop: 3, lineHeight: 18 },
  modalCancel: { marginTop: 16, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { color: COLORS.ink3, fontSize: 14 },

  // 사용 안내 모달
  guideList: { gap: 12, marginTop: 4, marginBottom: 4 },
  guideLine: { color: COLORS.ink2, fontSize: 14.5, lineHeight: 21 },
  guideGotIt: {
    marginTop: 18,
    backgroundColor: COLORS.ember,
    borderRadius: RADII.btn,
    paddingVertical: 15,
    alignItems: 'center',
  },
  guideGotItText: { color: COLORS.emberText, fontSize: 15, fontWeight: '600' },
});
