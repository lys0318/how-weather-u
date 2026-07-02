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
  TextInput,
  AppState,
  Alert,
  RefreshControl,
  Animated,
} from 'react-native';
import { useWeather } from '../hooks/useWeather';
import { useMessage } from '../hooks/useMessage';
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
  computeUmbrella,
} from '../constants/weather';
import HourlyForecast from '../components/HourlyForecast';
import WeeklyForecast from '../components/WeeklyForecast';
import OutfitCard from '../components/OutfitCard';
import LifeIndex from '../components/LifeIndex';
import AppBanner from '../components/AppBanner';
import { runWithGate } from '../hooks/useGenerationGate';
import { saveMessage, isGuideDismissedToday, dismissGuideToday, isProfilePrompted, setProfilePrompted, recordTempPoint, getYesterdayTempDelta, setLastWidgetWeather } from '../utils/storage';
import { pushWidget } from '../services/widgetContent';
import ProfileEditor from '../components/ProfileEditor';
import { getMyProfile } from '../services/profile';
import { useI18n } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { refreshNotificationsIfNeeded } from '../services/notification';
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

const LOADING_KEYS = [
  'home.loading1', 'home.loading2', 'home.loading3',
  'home.loading4', 'home.loading5', 'home.loading6',
];

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function isLimitError(raw: string | null): boolean {
  if (!raw) return false;
  return raw.includes('한도') || raw.includes('LIMIT') || raw.includes('limit');
}
function prettifyError(raw: string | null, t: TFn): string | null {
  if (!raw) return null;
  if (isLimitError(raw)) return t('errors.limit');
  if (raw.includes('Network') || raw.includes('네트워크') || raw.includes('fetch')) return t('errors.network');
  if (raw.includes('401') || raw.includes('인증')) return t('errors.auth');
  if (raw.includes('429')) return t('errors.tooFast');
  if (raw.includes('500') || raw.includes('Claude') || raw.includes('서버')) return t('errors.server');
  return raw;
}

export default function HomeScreen() {
  const { weather, loading: weatherLoading, error: weatherError, refetch } = useWeather();
  const { message, loading: messageLoading, error: messageError, generate } = useMessage();
  const { t, lang } = useI18n();
  const { isGuest } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tempDelta, setTempDelta] = useState<number | null>(null);
  const [mood, setMood] = useState('');
  const [situation, setSituation] = useState('');
  const [selectedPref, setSelectedPref] = useState<Preference | undefined>(undefined);
  const lastInputs = useRef<{ mood?: string; situation?: string }>({});
  const [profilePromptOpen, setProfilePromptOpen] = useState(false);

  // 로그인 후 1회: 프로필 미작성이면 작성 유도(선택 — 닫으면 건너뛰기)
  useEffect(() => {
    (async () => {
      if (isGuest) return;
      if (await isProfilePrompted()) return;
      try {
        const p = await getMyProfile();
        const empty = !p || (!p.nickname && !p.ageBand && !p.occupation && !p.interests && !p.concern);
        if (empty) setProfilePromptOpen(true);
      } catch {}
      await setProfilePrompted();
    })();
  }, []);
  const [guideOpen, setGuideOpen] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [now, setNow] = useState<Date>(() => new Date());
  const letterAnim = useRef(new Animated.Value(0)).current;
  const [letterExpanded, setLetterExpanded] = useState(false);
  const lastLetterTapRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
    }, []),
  );

  useEffect(() => {
    const msUntilNextMinute = 60_000 - (new Date().getSeconds() * 1000 + new Date().getMilliseconds());
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const firstTimer = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60_000);
    }, msUntilNextMinute);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });

    return () => {
      clearTimeout(firstTimer);
      if (intervalId) clearInterval(intervalId);
      sub.remove();
    };
  }, []);

  useEffect(() => {
    isGuideDismissedToday().then((dismissed) => {
      if (!dismissed) setGuideOpen(true);
    }).catch(() => {});
  }, []);

  const handleDismissGuideToday = useCallback(() => {
    dismissGuideToday().catch(() => {});
    setGuideOpen(false);
  }, []);

  const anyLoading = messageLoading;
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
    Animated.spring(letterAnim, { toValue: 1, friction: 8, tension: 62, useNativeDriver: true }).start();
  }, [letterAnim, message]);

  const handleLetterPress = useCallback(() => {
    const nowMs = Date.now();
    if (nowMs - lastLetterTapRef.current < 320) setLetterExpanded(true);
    lastLetterTapRef.current = nowMs;
  }, []);

  const isEn = lang === 'en';
  const hour = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const dow = now.getDay();
  const timeOfDay = isEn ? TIME_OF_DAY_EN[getTimeOfDay(hour)] : TIME_OF_DAY_KO[getTimeOfDay(hour)];
  const dateText = isEn
    ? `${DAY_OF_WEEK_EN_SHORT[dow]}, ${MONTH_EN_SHORT[month - 1]} ${day}`
    : `${month}월 ${day}일 ${DAY_OF_WEEK_KO[dow]}`;
  const timeText = `${timeOfDay} · ${hour}:${minutes}`;
  const dateLabel = `${dateText} ${timeOfDay}`;
  const prefLabel = (p: Preference) => (isEn ? PREFERENCE_EN[p] : PREFERENCE_KO[p]);
  const conditionLabel = (c: WeatherCondition, ko: string) => (isEn ? CONDITION_META[c].en : ko);
  const toneTag = (p: Preference) =>
    isEn ? PREFERENCE_EN[p].toUpperCase() : `${PREFERENCE_KO[p]} · ${PREFERENCE_EN[p].toUpperCase()}`;

  const skyKind = getSkyKind(weather?.condition ?? null, hour);
  const paper = getPaperTint(skyKind);

  const umbrella = weather ? computeUmbrella(weather, hour) : null;
  let umbrellaText: string | null = null;
  if (umbrella?.needed) {
    const pct = Math.round(umbrella.pop * 100);
    if (umbrella.raining) {
      umbrellaText = t('home.umbrellaNow');
    } else if (umbrella.hoursUntil && umbrella.hoursUntil >= 1) {
      umbrellaText = pct > 0
        ? t('home.umbrellaH', { hours: umbrella.hoursUntil, pct })
        : t('home.umbrellaHNoPct', { hours: umbrella.hoursUntil });
    } else {
      umbrellaText = pct > 0 ? t('home.umbrellaSoon', { pct }) : t('home.umbrellaSoonNoPct');
    }
  }

  useEffect(() => {
    (async () => {
      try { await refreshNotificationsIfNeeded(); } catch {}
    })();
  }, []);

  // 날씨 로드되면 아침 브리핑 알림 갱신 + 어제 대비 온도 기록/계산 + 위젯 갱신
  useEffect(() => {
    if (weather) {
      refreshNotificationsIfNeeded(weather).catch(() => {});
      (async () => {
        await recordTempPoint(weather.temp);
        setTempDelta(await getYesterdayTempDelta(weather.temp));
        await setLastWidgetWeather(weather);
        await pushWidget();
      })().catch(() => {});
    }
  }, [weather]);

  useEffect(() => {
    if (message && weather) {
      pushWidget().catch(() => {}); // 위젯 라인은 로컬 — 게스트도 갱신
      if (!isGuest) saveMessage(message, weather.emoji, lastInputs.current).catch(() => {});
    }
  }, [message]);

  const openPicker = () => { setSelectedPref(undefined); setPickerOpen(true); };
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handlePickPreference = (pref: Preference) => {
    setPickerOpen(false);
    if (!weather) return;
    lastInputs.current = { mood: mood.trim() || undefined, situation: situation.trim() || undefined };
    runWithGate(() => generate(weather, pref, lastInputs.current));
    setMood(''); setSituation('');
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
      setNow(new Date());
      try { await refreshNotificationsIfNeeded(weather ?? undefined); } catch {}
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const handleShare = async () => {
    if (!message || !weather) return;
    setSharing(true);
    try {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      if (!cardRef.current) throw new Error('Share card ref is empty');
      const uri = await captureRef(cardRef, { format: 'png', quality: 0.95, result: 'tmpfile' });
      if (!uri) throw new Error('Share capture result is empty');
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        await Share.share({ message: `${weather.emoji} ${dateLabel}\n\n${message.text}\n\n${t('home.shareSignature')}` });
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('home.shareDialogTitle'), UTI: 'public.png' });
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack?.slice(0, 200) ?? ''}` : String(e);
      console.error('[share] failed:', e);
      Alert.alert(t('home.shareFailTitle'), t('home.shareFailBody', { msg }));
      await Share.share({ message: `${weather.emoji} ${dateLabel}\n\n${message.text}\n\n${t('home.shareSignature')}` }).catch(() => {});
    } finally {
      setSharing(false);
    }
  };

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
        {/* HERO */}
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
              {tempDelta !== null && (
                <Text style={styles.wxTrend}>
                  {tempDelta === 0
                    ? t('weather.trendSame')
                    : tempDelta > 0
                    ? t('weather.trendUp', { deg: tempDelta })
                    : t('weather.trendDown', { deg: Math.abs(tempDelta) })}
                </Text>
              )}
              <Text style={styles.wxCond}>{conditionLabel(weather.condition, weather.conditionKo)}</Text>
              <Text style={styles.wxCity}>
                {weather.city && weather.city !== '내 위치' ? weather.city : t('weather.myLocation')}
              </Text>

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
                        : '-'}
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
                      {weather.rainfall && weather.rainfall > 0 ? `${weather.rainfall}mm` : t('weather.noRain')}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* BODY */}
        <View style={[styles.body, { backgroundColor: paper }]}>
          {umbrellaText && (
            <View style={styles.umbrella}>
              <Text style={styles.umbrellaText}>{umbrellaText}</Text>
            </View>
          )}

          {isGuest && (
            <View style={styles.guestBanner}>
              <Text style={styles.guestBannerText}>☁️ {t('home.guestBanner')}</Text>
            </View>
          )}

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
            </View>
          )}

          {/* 오늘의 메시지 받기 — 앱 열자마자 눈에 띄게 시간별 예보 위에 배치 */}
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
            </View>
          )}

          {/* 시간별 예보 */}
          {weather?.hourly && weather.hourly.length > 0 && (
            <View style={styles.forecastSection}>
              <HourlyForecast slots={weather.hourly} currentHour={hour} />
            </View>
          )}

          {/* 주간 예보 */}
          {weather?.daily && weather.daily.length > 0 && (
            <View style={styles.forecastSection}>
              <WeeklyForecast days={weather.daily} />
            </View>
          )}

          {/* 오늘의 옷차림 */}
          {weather && (
            <View style={styles.forecastSection}>
              <OutfitCard weather={weather} currentHour={hour} />
            </View>
          )}

          {/* 생활지수 */}
          {weather && (
            <View style={styles.forecastSection}>
              <LifeIndex weather={weather} currentHour={hour} />
            </View>
          )}

          <View style={styles.appNameArea}>
            <Text style={styles.appName}>{t('common.appName')}</Text>
            <Text style={styles.appNameEn}>HOW WEATHER YOU</Text>
          </View>
        </View>
      </ScrollView>

      {/* 메시지 톤 선택 모달 */}
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
            <TextInput
              style={styles.toneInput}
              placeholder={t('gen.moodPh')}
              placeholderTextColor={COLORS.ink3}
              value={mood}
              onChangeText={setMood}
              maxLength={200}
            />
            <TextInput
              style={[styles.toneInput, styles.toneInputMultiline]}
              placeholder={t('gen.situationPh')}
              placeholderTextColor={COLORS.ink3}
              value={situation}
              onChangeText={setSituation}
              maxLength={200}
              multiline
            />
            <View style={styles.modalOptions}>
              {PREF_ORDER.map((key) => {
                const on = selectedPref === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.optionRow, on && styles.optionRowOn]}
                    onPress={() => setSelectedPref(key)}
                  >
                    <View style={styles.optionIco}>
                      <Text style={styles.optionEmoji}>{PREFERENCE_EMOJI[key]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle}>{prefLabel(key)}</Text>
                      <Text style={styles.optionDesc}>{t(PREF_DESC_KEY[key])}</Text>
                    </View>
                    {on && <Text style={styles.optionCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.modalSubmit, !selectedPref && styles.btnDisabled]}
              onPress={() => selectedPref && handlePickPreference(selectedPref)}
              disabled={!selectedPref}
            >
              <Text style={styles.modalSubmitText}>{t('gen.submit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setPickerOpen(false)}>
              <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 편지 전체 보기 모달 */}
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
              <Text style={styles.guideLine}>💌 {t('guide.line1')}</Text>
              <Text style={styles.guideLine}>📅 {t('guide.line2')}</Text>
              <Text style={styles.guideLine}>🎲 {t('guide.line3')}</Text>
              <Text style={styles.guideLine}>🎁 {t('guide.line4')}</Text>
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

      <ProfileEditor visible={profilePromptOpen} onClose={() => setProfilePromptOpen(false)} />

      <AppBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { flex: 1, backgroundColor: COLORS.paper },
  container: { paddingBottom: 80 },

  // HERO
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
  wxTrend: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.skyText2,
    letterSpacing: 0.3,
    marginTop: 4,
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

  // BODY
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

  forecastSection: {
    marginBottom: 16,
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
  },

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

  btnGroup: { gap: 10, marginTop: 2, marginBottom: 16 },
  primaryBtn: {
    backgroundColor: COLORS.ember,
    borderRadius: RADII.btn,
    paddingVertical: 17,
    alignItems: 'center',
  },
  primaryBtnText: { color: COLORS.emberText, fontSize: 15.5, fontWeight: '600', letterSpacing: 0.2 },
  btnDisabled: { opacity: 0.5 },

  appNameArea: { alignItems: 'center', marginTop: 30, marginBottom: 8 },
  appName: { fontFamily: FONTS.serifKo, fontSize: 14, color: COLORS.ink3, letterSpacing: 2 },
  appNameEn: { fontFamily: FONTS.mono, fontSize: 9.5, color: COLORS.ink3, letterSpacing: 2, marginTop: 4, opacity: 0.7 },

  // 모달
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
  toneInput: {
    borderWidth: 1, borderColor: COLORS.line, borderRadius: RADII.card,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14.5,
    color: COLORS.ink, backgroundColor: COLORS.card, marginBottom: 10,
  },
  toneInputMultiline: { minHeight: 64, textAlignVertical: 'top' },
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
  optionRowOn: { borderColor: COLORS.ember, backgroundColor: COLORS.emberSoft },
  optionCheck: { color: COLORS.ember, fontSize: 18, fontWeight: '700', marginLeft: 8 },
  modalSubmit: { backgroundColor: COLORS.ember, borderRadius: RADII.btn, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  modalSubmitText: { color: COLORS.emberText, fontSize: 15, fontWeight: '600' },
  modalCancel: { marginTop: 10, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { color: COLORS.ink3, fontSize: 14 },

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
