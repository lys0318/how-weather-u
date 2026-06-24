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
  Animated,
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

// ?? 濡쒕뵫 以?蹂댁뿬以??щ컡??臾멸뎄 ??????????????????????????????
const LOADING_KEYS = [
  'home.loading1', 'home.loading2', 'home.loading3',
  'home.loading4', 'home.loading5', 'home.loading6',
];

type TFn = (key: string, vars?: Record<string, string | number>) => string;

// ?? 移쒖젅???먮윭 硫붿떆吏 蹂??(?몄뼱 ?몄?) ???????????????????????
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

// ?? ?ъ슜 ?잛닔 ???쒓컖??????????????????????????????????????
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

// ?ν썑 ?덈낫?먯꽌 鍮????щ’??李얠븘 "N?쒓컙 ??/ ?뺣쪧" 怨꾩궛
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
  // ?쒕룄 珥덇낵 ??愿묎퀬 蹂????먮룞 ?ㅽ뻾???앹꽦 ?숈옉 蹂닿?
  const pendingGenRef = useRef<(() => void) | null>(null);
  // "異⑹쟾?섍린" 踰꾪듉?쇰줈 誘몃━ 愿묎퀬 蹂?寃쎌슦 ???ㅼ쓬 ?앹꽦 1?뚮뒗 ?꾨㈃ 愿묎퀬 ?앸왂
  const skipNextInterstitialRef = useRef(false);
  const letterAnim = useRef(new Animated.Value(0)).current;
  const [letterExpanded, setLetterExpanded] = useState(false);
  const lastLetterTapRef = useRef(0);

  // 홈은 하늘 위 - 밝은 상태바
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
    }, []),
  );

  // ?? ?쒓컙 ?먮룞 ?숆린??????????????????????????????????????
  // 1) 遺꾩씠 諛붾??뚮쭏??媛깆떊
  // 2) ?깆씠 諛깃렇?쇱슫?????ш렇?쇱슫??蹂듦? ??利됱떆 媛깆떊
  useEffect(() => {
    // ?ㅼ쓬 遺?寃쎄퀎??留욎떠 泥?媛깆떊???뺣젹 (UX ?먯뿰?ㅻ윭?)
    const msUntilNextMinute = 60_000 - (new Date().getSeconds() * 1000 + new Date().getMilliseconds());
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const firstTimer = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60_000);
    }, msUntilNextMinute);

    // 앱이 foreground로 돌아오면 시간과 사용량을 갱신
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

  // 留덉슫?????ㅻ뒛 ?ъ슜??利됱떆 議고쉶 (硫붿떆吏 ?앹꽦 ???대룄 ?붿뿬 ?잛닔 ?쒖떆)
  useEffect(() => {
    fetchTodayUsage().then((u) => { if (u) setServerUsage(u); });
  }, []);

  // 吏꾩엯 ???ъ슜 ?덈궡 紐⑤떖 ('?ㅻ뒛 ?섎（ ??蹂닿린' ???꾨Ⅸ 寃쎌슦留?
  useEffect(() => {
    isGuideDismissedToday().then((dismissed) => {
      if (!dismissed) setGuideOpen(true);
    }).catch(() => {});
  }, []);

  const handleDismissGuideToday = useCallback(() => {
    dismissGuideToday().catch(() => {});
    setGuideOpen(false);
  }, []);

  // 濡쒕뵫 以묒씪 ??臾멸뎄 2.5珥덈쭏???뚯쟾
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

  useEffect(() => {
    if (!message) return;
    letterAnim.setValue(0);
    Animated.spring(letterAnim, {
      toValue: 1,
      friction: 8,
      tension: 62,
      useNativeDriver: true,
    }).start();
  }, [letterAnim, message]);

  const handleLetterPress = useCallback(() => {
    const nowMs = Date.now();
    if (nowMs - lastLetterTapRef.current < 320) {
      setLetterExpanded(true);
    }
    lastLetterTapRef.current = nowMs;
  }, []);

  const isEn = lang === 'en';
  const hour = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const dow = now.getDay();
  const timeOfDay = isEn ? TIME_OF_DAY_EN[getTimeOfDay(hour)] : TIME_OF_DAY_KO[getTimeOfDay(hour)];
  // ?좎쭨 ?쇰꺼: ko "6??13???좎슂?? / en "Sat, Jun 13"
  const dateText = isEn
    ? `${DAY_OF_WEEK_EN_SHORT[dow]}, ${MONTH_EN_SHORT[month - 1]} ${day}`
    : `${month}월 ${day}일 ${DAY_OF_WEEK_KO[dow]}`;
  const timeText = `${timeOfDay} · ${hour}:${minutes}`;

  // 怨듭쑀/移대뱶???좎쭨 ?쇰꺼 (?쒓컙? ?ы븿)
  const dateLabel = `${dateText} ${timeOfDay}`;
  const prefLabel = (p: Preference) => (isEn ? PREFERENCE_EN[p] : PREFERENCE_KO[p]);
  const conditionLabel = (c: WeatherCondition, ko: string) => (isEn ? CONDITION_META[c].en : ko);
  // ?몄? ???쒓렇: ko "?꾨줈 쨌 COMFORT" / en "COMFORT"
  const toneTag = (p: Preference) =>
    isEn ? PREFERENCE_EN[p].toUpperCase() : `${PREFERENCE_KO[p]} · ${PREFERENCE_EN[p].toUpperCase()}`;

  const skyKind = getSkyKind(weather?.condition ?? null, hour);
  const paper = getPaperTint(skyKind);

  // 鍮??덈낫 ???곗궛 ?덈궡
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

  // ?앹꽦 ?묐떟???ы븿??理쒖떊 ?ъ슜?됱쓣 ?붾㈃???⑥씪 usage ?곹깭濡??≪닔?쒕떎.
  // 蹂댁긽??愿묎퀬 異⑹쟾 ?꾩뿉??serverUsage媛 利됱떆 +1 ??limit??媛뽮린 ?뚮Ц??
  // ?ㅻ옒???앹꽦 ?묐떟(?? 3/3)???붾㈃???ㅼ떆 ??뼱?곗? ?딄쾶 ?쒕떎.
  useEffect(() => {
    const latestUsage = [message, activity, food]
      .filter((x): x is NonNullable<typeof x> => !!x && typeof x.used === 'number' && typeof x.limit === 'number')
      .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())[0];
    if (latestUsage) {
      setServerUsage({ used: latestUsage.used as number, limit: latestUsage.limit as number });
      pendingGenRef.current = null;
    }
  }, [message, activity, food]);

  const displayUsage = serverUsage;
  const usageText = displayUsage
    ? t('home.usageUsed', { used: displayUsage.used, limit: displayUsage.limit })
    : t('home.usageFallback');

  // ???????덉빟 ?뚮┝ 遺議깊븯硫??먮룞 蹂댁땐
  useEffect(() => {
    (async () => {
      try {
        await refreshNotificationsIfNeeded();
      } catch {}
    })();
  }, []);

  // 생성된 메시지 저장
  useEffect(() => {
    if (message && weather && !isGuest) {
      saveMessage(message, weather.emoji).catch(() => {});
    }
  }, [message]);

  // ?쒕룞 異붿쿇 ?????寃뚯뒪???쒖쇅
  useEffect(() => {
    if (activity && weather && !isGuest) {
      saveEntry(activity.text, weather.emoji, weather.condition, 'activity').catch(() => {});
    }
  }, [activity]);

  // ?뚯떇 異붿쿇 ?????寃뚯뒪???쒖쇅
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

  /**
   * ?앹꽦 ?몃━嫄???愿묎퀬 ?뺤콉 遺꾧린
   * - ?쒕룄 ?대궡: ?섎（ 泥?1?뚮쭔 臾대즺, ?댄썑 吏㏃? ?꾨㈃ 愿묎퀬 ???앹꽦
   * - ?쒕룄 珥덇낵: 湲?蹂댁긽??愿묎퀬濡?+1 異⑹쟾 ??諛⑷툑 ?꾨Ⅸ 異붿쿇 ?댁뼱???앹꽦
   */
  const triggerGenerate = useCallback(
    async (fn: () => void) => {
      let usageForDecision = displayUsage;
      if (!usageForDecision) {
        const freshUsage = await fetchTodayUsage();
        if (freshUsage) {
          usageForDecision = freshUsage;
          setServerUsage(freshUsage);
        }
      }

      const overLimit = !!usageForDecision && usageForDecision.used >= usageForDecision.limit;
      const isFirstFreeGeneration = usageForDecision?.used === 0;
      pendingGenRef.current = fn;

      if (overLimit) {
        // ?먮룞?쇰줈 湲?愿묎퀬瑜??꾩슦吏 ?딄퀬, ?섎떒 異⑹쟾 踰꾪듉?쇰줈 ?덈궡.
        // ?ъ슜?먭? 蹂댁긽??愿묎퀬瑜?蹂대㈃ pendingGenRef???앹꽦 ?숈옉??諛붾줈 ?댁뼱 ?ㅽ뻾?쒕떎.
        Alert.alert(t('home.overLimitTitle'), t('home.overLimitBody'));
        return;
      }

      if (skipNextInterstitialRef.current) {
        // 吏곸쟾??"異⑹쟾?섍린"濡??대? 愿묎퀬瑜?遊ㅼ쑝硫??꾨㈃ 愿묎퀬 ?앸왂?섍퀬 諛붾줈 ?앹꽦
        skipNextInterstitialRef.current = false;
        fn();
      } else {
        // ?쒕룄 ?대궡 ???섎（ 泥??앹꽦? 臾대즺, 2쨌3?뚯감??吏㏃? ?꾨㈃ 愿묎퀬 ???앹꽦
        showInterstitialThenRun(fn, isFirstFreeGeneration);
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

  // 留??꾨옒 "愿묎퀬 蹂닿퀬 1??異⑹쟾?섍린" ?꾩슜 ??異⑹쟾留??섍퀬 ?먯쑀濡?쾶 ?앹꽦?섎룄濡?(?먮룞 ?앹꽦 X)
  const handleChargeOnly = useCallback(async () => {
    if (watchingAd) return;
    setWatchingAd(true);
    try {
      const result = await showRewardedAndGrant();
      if (result) {
        setServerUsage(result);
        const pending = pendingGenRef.current;
        if (pending) {
          pendingGenRef.current = null;
          pending();
        } else {
          // 諛⑷툑 愿묎퀬瑜?遊ㅼ쑝?? ?ㅼ쓬 ?앹꽦 1?뚮뒗 ?꾨㈃ 愿묎퀬 ?앸왂
          skipNextInterstitialRef.current = true;
          Alert.alert(t('home.chargeDoneTitle'), t('home.chargeDoneFree'));
        }
      } else {
        Alert.alert(t('home.adUnavailableTitle'), t('home.adUnavailableBodyCharge'));
      }
    } finally {
      setWatchingAd(false);
    }
  }, [watchingAd, t]);

  // (?먮윭 移대뱶) 愿묎퀬 蹂닿퀬 異붽? ?댁슜 ??吏곸쟾 ?쒕룄???앹꽦 ?먮룞 ?ㅽ뻾
  const handleWatchAdForCredit = useCallback(async () => {
    if (watchingAd) return;
    setWatchingAd(true);
    try {
      const result = await showRewardedAndGrant();
      if (result) {
        setServerUsage(result);
        // 吏곸쟾???쒕룄???앹꽦 ?숈옉???덉쑝硫??먮룞 ?ㅽ뻾 (踰꾪듉 ?ы겢由?遺덊븘??
        if (pendingGenRef.current) {
          const pending = pendingGenRef.current;
          pendingGenRef.current = null;
          pending();
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
      // ?좎뵪 ?덈줈 媛?몄삤湲?(罹먯떆 臾댁떆)
      await refetch();
      // ?쒓컙 媛깆떊 (洹몃씪?붿뼵???몄궗留?利됱떆 諛섏쁺)
      setNow(new Date());
      // ?ㅻ뒛 ?ъ슜???ъ“??      fetchTodayUsage().then((u) => { if (u) setServerUsage(u); });
      // ?덉빟 ?뚮┝ 蹂댁땐 ?쒕룄 (?ㅽ뙣?대룄 臾댁떆)
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
      // ?ㅼ쓬 ?꾨젅?꾧퉴吏 ?湲?(移대뱶媛 ?꾩쟾???뚮뜑留곷릺?꾨줉)
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

      // 移대뱶 罹≪쿂
      if (!cardRef.current) throw new Error('Share card ref is empty');
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 0.95,
        result: 'tmpfile',
      });
      if (!uri) throw new Error('Share capture result is empty');

      // 怨듭쑀
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
        {/* ??? HERO (?섏콈 ?섎뒛) ??? */}
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
              <Text style={styles.wxTemp}>{weather.temp}℃</Text>
              <Text style={styles.wxRange}>
                {t('weather.tempRange', { min: weather.tempMin, max: weather.tempMax })}
              </Text>
              <Text style={styles.wxCond}>{conditionLabel(weather.condition, weather.conditionKo)}</Text>
              <Text style={styles.wxCity}>
                {weather.city && weather.city !== '내 위치' ? weather.city : t('weather.myLocation')}
              </Text>

              {/* 泥닿컧 / ?듬룄 / 諛붾엺 ???좊━ ?ㅽ듃由?*/}
              <View style={styles.glassRow}>
                <View style={styles.glassCell}>
                  <Text style={styles.glassK}>{t('weather.feelsLike')}</Text>
                  <Text style={styles.glassV}>{weather.feelsLike}℃</Text>
                </View>
                <View style={styles.glassDivider} />
                <View style={styles.glassCell}>
                  <Text style={styles.glassK}>{t('weather.humidity')}</Text>
                  <Text style={styles.glassV}>{weather.humidity}%</Text>
                </View>
                <View style={styles.glassDivider} />
                <View style={styles.glassCell}>
                  <Text style={styles.glassK}>{t('weather.wind')}</Text>
                  <Text style={styles.glassV}>{weather.windSpeed}m/s</Text>
                </View>
              </View>

              {/* ?먯쇅??/ 誘몄꽭癒쇱? / 媛뺤닔 (媛??덉쓣 ?뚮쭔) */}
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
                        : '-' }
                    </Text>
                  </View>
                  <View style={styles.glassDivider} />
                  <View style={styles.glassCell}>
                    <Text style={styles.glassK}>{t('weather.dust')}</Text>
                    <Text style={styles.glassV}>
                      {(() => {
                        const g = airQualityGrade(weather.pm10, weather.pm25);
                        return g ? (isEn ? g.en : g.ko) : '-';
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

        {/* ??? ?섏씠??蹂몃Ц ??? */}
        <View style={[styles.body, { backgroundColor: paper }]}>
          {/* 鍮??덈낫 ???곗궛 ?덈궡 */}
          {umbrellaText && (
            <View style={styles.umbrella}>
              <Text style={styles.umbrellaText}>{umbrellaText}</Text>
            </View>
          )}

          {/* 寃뚯뒪???덈궡 諛곕꼫 */}
          {isGuest && (
            <View style={styles.guestBanner}>
              <Text style={styles.guestBannerText}>☁️ {t('home.guestBanner')}</Text>
            </View>
          )}

          {/* 濡쒕뵫 以?臾멸뎄 */}
          {anyLoading && (
            <View style={styles.envelopeLoading}>
              <View style={styles.loadingEnvelope}>
                <View style={styles.loadingEnvelopeFlap} />
                <View style={styles.loadingEnvelopePocket} />
                <View style={styles.loadingSeal}>
                  <ActivityIndicator color={COLORS.emberText} size="small" />
                </View>
              </View>
              <Text style={styles.loadingCardText}>{loadingMsg}</Text>
            </View>
          )}

          {/* 媛먯꽦 硫붿떆吏 ??遊됲닾?먯꽌 爰쇰궦 ?몄? */}
          {message && (
            <View style={styles.letterScene}>
              <View style={styles.envelopeBack}>
                <View style={styles.envelopeBackFlap} />
              </View>
              <Pressable onPress={handleLetterPress}>
                <Animated.View
                  style={[
                    styles.note,
                    {
                      opacity: letterAnim.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.95, 1] }),
                      transform: [
                        { translateY: letterAnim.interpolate({ inputRange: [0, 1], outputRange: [46, 0] }) },
                        { scale: letterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                      ],
                    },
                  ]}
                >
                  <View style={styles.notePaperLine} />
                  <View style={styles.noteTag}>
                    <View style={styles.noteStamp}>
                      <Text style={styles.noteTagEmoji}>{PREFERENCE_EMOJI[message.context.preference]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.noteKicker}>SKY LETTER</Text>
                      <Text style={styles.noteTagText}>{toneTag(message.context.preference)}</Text>
                    </View>
                  </View>
                  <Text style={styles.noteText}>{message.text}</Text>
                  <View style={styles.noteFoot}>
                    <View>
                      <Text style={styles.noteSign}>{t('common.appName')}</Text>
                      <Text style={styles.noteDate}>{dateLabel}</Text>
                    </View>
                    <TouchableOpacity onPress={handleShare} style={styles.noteShare} disabled={sharing}>
                      {sharing ? (
                        <ActivityIndicator color={COLORS.ember} size="small" />
                      ) : (
                        <>
                          <Text style={styles.noteShareIcon}>↗</Text>
                          <Text style={styles.noteShareText}>{t('home.shareUp')}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              </Pressable>
              <View pointerEvents="none" style={styles.envelopeFront}>
                <View style={styles.envelopeFrontLeft} />
                <View style={styles.envelopeFrontRight} />
                <View style={styles.envelopeSeal}>
                  <Text style={styles.envelopeSealText}>{weather?.emoji ?? '💌'}</Text>
                </View>
              </View>
            </View>
          )}

          {/* 怨듭쑀??移대뱶 ??罹≪쿂 ?꾩슜 (?붾㈃???곹뼢 ?놁쓬) */}
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

          {/* ?쒕룞 異붿쿇 */}
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

          {/* ?뚯떇 異붿쿇 */}
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

          {/* 踰꾪듉 ?곸뿭 */}
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

              {/* ?ъ슜 ?잛닔 ???쒓컖??*/}
              <View style={styles.usageContainer}>
                <UsageDots used={displayUsage?.used ?? 0} limit={displayUsage?.limit ?? 3} />
                <Text style={styles.usageText}>{usageText}</Text>

                {/* ?쒕룄 ?꾨떖 ????愿묎퀬 蹂닿퀬 異⑹쟾 */}
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

          {/* ???대쫫 */}
          <View style={styles.appNameArea}>
            <Text style={styles.appName}>{t('common.appName')}</Text>
            <Text style={styles.appNameEn}>HOW WEATHER YOU</Text>
          </View>
        </View>
      </ScrollView>

      {/* 硫붿떆吏 ?좏삎 ?좏깮 紐⑤떖 */}
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

      {/* ?ъ슜 ?덈궡 紐⑤떖 (吏꾩엯 ??1?? '?ㅻ뒛 ?섎（ ??蹂닿린'濡??? */}
      <Modal
        animationType="fade"
        transparent
        visible={letterExpanded}
        onRequestClose={() => setLetterExpanded(false)}
      >
        <Pressable style={styles.fullLetterOverlay} onPress={() => setLetterExpanded(false)}>
          <Pressable style={styles.fullLetterWrap} onPress={(e) => e.stopPropagation()}>
            <View style={styles.fullLetterSheet}>
              <View style={styles.fullLetterLine} />
              {message && (
                <>
                  <View style={styles.fullLetterHead}>
                    <View style={styles.fullLetterStamp}>
                      <Text style={styles.fullLetterStampText}>
                        {PREFERENCE_EMOJI[message.context.preference]}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fullLetterKicker}>SKY LETTER</Text>
                      <Text style={styles.fullLetterTone}>{toneTag(message.context.preference)}</Text>
                    </View>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false} style={styles.fullLetterScroll}>
                    <Text style={styles.fullLetterText}>{message.text}</Text>
                  </ScrollView>
                  <View style={styles.fullLetterFoot}>
                    <View>
                      <Text style={styles.fullLetterSign}>{t('common.appName')}</Text>
                      <Text style={styles.fullLetterDate}>{dateLabel}</Text>
                    </View>
                    <TouchableOpacity style={styles.fullLetterClose} onPress={() => setLetterExpanded(false)}>
                      <Text style={styles.fullLetterCloseText}>{t('common.close')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
              <Text style={styles.guideLine}>🌤️ {t('guide.line1')}</Text>
              <Text style={styles.guideLine}>💌 {t('guide.line2')}</Text>
              <Text style={styles.guideLine}>🎁 {t('guide.line3')}</Text>
              <Text style={styles.guideLine}>📮 {t('guide.line4')}</Text>
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

  // ??? HERO ???
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

  // ??? ?섏씠??蹂몃Ц ???
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

  envelopeLoading: {
    backgroundColor: 'rgba(251,247,238,0.74)',
    borderRadius: RADII.card,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  loadingEnvelope: {
    width: 56,
    height: 38,
    borderRadius: 8,
    backgroundColor: COLORS.paper2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  loadingEnvelopeFlap: {
    position: 'absolute',
    top: -17,
    left: 8,
    width: 40,
    height: 40,
    backgroundColor: COLORS.card,
    transform: [{ rotate: '45deg' }],
    borderWidth: 1,
    borderColor: COLORS.line2,
  },
  loadingEnvelopePocket: {
    position: 'absolute',
    left: -8,
    right: -8,
    bottom: -22,
    height: 44,
    backgroundColor: COLORS.paper3,
    transform: [{ rotate: '-5deg' }],
    opacity: 0.72,
  },
  loadingSeal: {
    position: 'absolute',
    left: 18,
    top: 12,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.ember,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingCardText: { color: COLORS.ink2, fontSize: 13, flex: 1, lineHeight: 19 },

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

  // ?몄? ?명듃
  letterScene: {
    minHeight: 430,
    marginBottom: 24,
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  envelopeBack: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 0,
    height: 154,
    borderRadius: 22,
    backgroundColor: COLORS.paper2,
    borderWidth: 1,
    borderColor: COLORS.line,
    shadowColor: '#2B2620',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
  },
  envelopeBackFlap: {
    position: 'absolute',
    left: 48,
    right: 48,
    top: -58,
    height: 116,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line2,
    transform: [{ rotate: '45deg' }],
  },
  note: {
    backgroundColor: '#FFFDF7',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(120,95,65,0.18)',
    marginHorizontal: 16,
    marginBottom: 138,
    shadowColor: '#2B2620',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
    zIndex: 3,
  },
  notePaperLine: {
    position: 'absolute',
    top: 0,
    left: 22,
    right: 22,
    height: 4,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
    backgroundColor: COLORS.emberSoft,
  },
  noteTag: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  notePip: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.ember },
  noteStamp: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.emberSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(194,104,63,0.20)',
  },
  noteTagEmoji: { fontSize: 17 },
  noteKicker: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.ink3,
    letterSpacing: 1.4,
    marginBottom: 3,
  },
  noteTagText: {
    fontSize: 11.5,
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
    fontSize: 18.5,
    lineHeight: 33,
    color: COLORS.ink,
    letterSpacing: -0.2,
  },
  noteFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(43,38,32,0.08)',
  },
  noteSign: { fontFamily: FONTS.serifKoBold, fontSize: 13, color: COLORS.ink2 },
  noteDate: { fontFamily: FONTS.mono, fontSize: 10.5, color: COLORS.ink3, marginTop: 4 },
  noteShare: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(194,104,63,0.24)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.emberSoft,
  },
  noteShareIcon: { color: COLORS.emberD, fontSize: 13, fontWeight: '800' },
  noteShareText: { fontSize: 12.5, fontWeight: '700', color: COLORS.emberD },
  envelopeFront: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 0,
    height: 116,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    overflow: 'hidden',
    zIndex: 2,
  },
  envelopeFrontLeft: {
    position: 'absolute',
    left: -60,
    bottom: -74,
    width: '72%',
    height: 160,
    backgroundColor: COLORS.paper3,
    transform: [{ rotate: '24deg' }],
    borderWidth: 1,
    borderColor: COLORS.line2,
  },
  envelopeFrontRight: {
    position: 'absolute',
    right: -60,
    bottom: -74,
    width: '72%',
    height: 160,
    backgroundColor: COLORS.paper2,
    transform: [{ rotate: '-24deg' }],
    borderWidth: 1,
    borderColor: COLORS.line2,
  },
  envelopeSeal: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 38,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.ember,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,245,238,0.75)',
  },
  envelopeSealText: { fontSize: 18 },

  // ?쒕룞/?뚯떇 異붿쿇 移대뱶
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

  // 踰꾪듉
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

  // ??? 紐⑤떖 (?섏씠???쒗듃) ???
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

  // ?ъ슜 ?덈궡 紐⑤떖
  fullLetterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28,22,30,0.58)',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 38,
  },
  fullLetterWrap: { flex: 1, justifyContent: 'center' },
  fullLetterSheet: {
    maxHeight: '88%',
    backgroundColor: '#FFFDF7',
    borderRadius: 22,
    paddingHorizontal: 24,
    paddingTop: 25,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(120,95,65,0.20)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  fullLetterLine: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 5,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
    backgroundColor: COLORS.emberSoft,
  },
  fullLetterHead: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 18 },
  fullLetterStamp: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.emberSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(194,104,63,0.22)',
  },
  fullLetterStampText: { fontSize: 19 },
  fullLetterKicker: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    color: COLORS.ink3,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  fullLetterTone: { color: COLORS.emberD, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.9 },
  fullLetterScroll: { marginHorizontal: -2 },
  fullLetterText: {
    fontFamily: FONTS.serifKo,
    fontSize: 20,
    lineHeight: 35,
    color: COLORS.ink,
    letterSpacing: -0.2,
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  fullLetterFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(43,38,32,0.08)',
  },
  fullLetterSign: { fontFamily: FONTS.serifKoBold, fontSize: 14, color: COLORS.ink2 },
  fullLetterDate: { fontFamily: FONTS.mono, fontSize: 10.5, color: COLORS.ink3, marginTop: 4 },
  fullLetterClose: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: COLORS.ember,
  },
  fullLetterCloseText: { color: COLORS.emberText, fontSize: 13, fontWeight: '700' },

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
