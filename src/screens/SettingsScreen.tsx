import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  Switch,
} from 'react-native';
import {
  setNotificationsEnabled,
  getNotificationsEnabled,
  getNotifSlots,
  setNotifSlots,
  NotifSlot,
} from '../utils/storage';
import {
  requestNotificationPermission,
  scheduleSlotNotifications,
  cancelAllNotifications,
  refreshNotificationsIfNeeded,
  SLOT_CONFIG,
} from '../services/notification';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import { COLORS, FONTS, RADII } from '../constants/theme';
import { useWeather } from '../hooks/useWeather';
import { getSkyKind, getPaperTint } from '../components/SkyBackground';

const SLOT_LABEL_KEY: Record<NotifSlot, string> = {
  morning: 'settings.slotMorning',
  lunch: 'settings.slotLunch',
  evening: 'settings.slotEvening',
};

export default function SettingsScreen() {
  const { user, signOut, deleteAccount, isGuest, signInWithGoogle } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { weather } = useWeather();
  const paper = getPaperTint(getSkyKind(weather?.condition ?? null, new Date().getHours()));
  const [deleting, setDeleting] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  // 게스트 → 구글 로그인 (성공 시 세션 전환 → 자동 라우팅)
  const handleGuestUpgrade = async () => {
    setUpgrading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('login.genericError');
      Alert.alert(t('login.failTitle'), msg);
    } finally {
      setUpgrading(false);
    }
  };
  // 알림 활성화 상태 (Switch에 바인딩) — 디폴트 OFF
  const [notifEnabled, setNotifEnabled] = useState<boolean>(false);
  const [notifToggling, setNotifToggling] = useState(false);
  // 선택된 시간대 (아침/점심/저녁)
  const [slots, setSlots] = useState<NotifSlot[]>(['morning', 'lunch', 'evening']);

  const userName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    t('settings.guest');
  const userEmail = user?.email || '';

  const handleLogout = () => {
    Alert.alert(
      t('settings.logout'),
      t('settings.logoutBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: async () => {
            await signOut();
          },
        },
      ],
    );
  };

  // 계정 탈퇴: 두 단계 확인 후 즉시 영구 삭제
  const handleDeleteAccount = () => {
    Alert.alert(
      t('settings.deleteAccount'),
      t('settings.deleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteContinue'),
          style: 'destructive',
          onPress: () => {
            // 두 번째 확인
            Alert.alert(
              t('settings.deleteFinalTitle'),
              t('settings.deleteFinalBody'),
              [
                { text: t('settings.deleteNo'), style: 'cancel' },
                {
                  text: t('settings.deleteYes'),
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await deleteAccount();
                      // 성공 시 자동으로 로그인 화면으로 라우팅됨 (세션 클리어)
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e);
                      Alert.alert(t('settings.deleteFailTitle'), t('settings.deleteFailBody', { msg }));
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  // 진입 시 알림 자동 보충 + Switch/슬롯 초기 상태 로드
  useEffect(() => {
    (async () => {
      try {
        const [enabled, savedSlots] = await Promise.all([
          getNotificationsEnabled(),
          getNotifSlots(),
        ]);
        setNotifEnabled(enabled);
        setSlots(savedSlots);
        await refreshNotificationsIfNeeded();
      } catch {}
    })();
  }, []);

  // 페이퍼 화면 — 다크 상태바
  useFocusEffect(
    React.useCallback(() => {
      setStatusBarStyle('dark');
    }, []),
  );

  /**
   * 알림 ON/OFF 토글
   * - ON: 권한 요청 → 플래그 true → 현재 선택된 슬롯 예약
   * - OFF: 플래그 false → 모든 예약 취소
   */
  const handleToggleNotifications = async (newValue: boolean) => {
    if (notifToggling) return;
    setNotifToggling(true);
    try {
      if (newValue) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          Alert.alert(t('settings.permTitle'), t('settings.permBody'), [
            { text: t('settings.openSettings'), onPress: () => Linking.openSettings() },
            { text: t('common.cancel'), style: 'cancel' },
          ]);
          return;
        }
        await setNotificationsEnabled(true);
        const current = await getNotifSlots();
        // 비어있으면 기본값 셋 다로 채워줌
        const targetSlots = current.length > 0 ? current : (['morning', 'lunch', 'evening'] as NotifSlot[]);
        if (current.length === 0) {
          await setNotifSlots(targetSlots);
          setSlots(targetSlots);
        }
        await scheduleSlotNotifications(targetSlots);
        setNotifEnabled(true);
      } else {
        await setNotificationsEnabled(false);
        await cancelAllNotifications();
        setNotifEnabled(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('settings.errorTitle'), t('settings.notifChangeFail', { msg }));
    } finally {
      setNotifToggling(false);
    }
  };

  /**
   * 시간대(아침/점심/저녁) 토글
   */
  const toggleSlot = async (slot: NotifSlot) => {
    const next = slots.includes(slot)
      ? slots.filter((s) => s !== slot)
      : [...slots, slot];
    setSlots(next);
    await setNotifSlots(next);
    // 알림 켜져있을 때만 재예약
    if (notifEnabled) {
      await scheduleSlotNotifications(next);
    }
  };

  // 피드백 / 버그 신고 (Google Forms)
  const FEEDBACK_URL =
    'https://docs.google.com/forms/d/e/1FAIpQLSd6BzHAmmq7897H8AYbajAAz17YRVNs9KbIhTCZK-vTllMBLw/viewform?usp=dialog';
  const handleFeedback = async () => {
    try {
      const supported = await Linking.canOpenURL(FEEDBACK_URL);
      if (!supported) {
        Alert.alert(t('settings.errorTitle'), t('settings.browserFail'));
        return;
      }
      await Linking.openURL(FEEDBACK_URL);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('settings.errorTitle'), t('settings.feedbackOpenFail', { msg }));
    }
  };

  // 약관 / 개인정보처리방침 — 현재 언어에 맞는 페이지로 (영어면 -en)
  const openLegal = (doc: 'terms' | 'privacy-policy') => {
    const url = `https://how-weather-u.pages.dev/${doc}${lang === 'en' ? '-en' : ''}.html`;
    Linking.openURL(url).catch(() => {
      Alert.alert(t('settings.errorTitle'), t('settings.browserFail'));
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: paper }]}>
      <LinearGradient
        colors={[COLORS.paper2, paper]}
        style={styles.crown}
        pointerEvents="none"
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.heading}>{t('settings.heading')}</Text>

      {/* 사용자 카드 */}
      <View style={styles.userCard}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>
            {userName.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{userName}</Text>
          {userEmail ? <Text style={styles.userEmail}>{userEmail}</Text> : null}
        </View>
      </View>

      {/* 언어 선택 */}
      <View style={styles.slotsCard}>
        <Text style={styles.slotsTitle}>{t('settings.languageTitle')}</Text>
        <Text style={styles.slotsSub}>{t('settings.languageSub')}</Text>
        <View style={styles.slotsRow}>
          {(['ko', 'en'] as const).map((l) => {
            const active = lang === l;
            return (
              <TouchableOpacity
                key={l}
                style={[styles.slotChip, active && styles.slotChipActive]}
                onPress={() => setLang(l)}
                activeOpacity={0.85}
              >
                <Text style={[styles.slotChipLabel, active && styles.slotChipLabelActive]}>
                  {l === 'ko' ? t('settings.langKo') : t('settings.langEn')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 알림 안내 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.notifTitle')}</Text>
        <Text style={styles.desc}>{t('settings.notifDesc')}</Text>
        <Text style={styles.subDesc}>{t('settings.notifSubDesc')}</Text>
      </View>

      {/* 알림 ON/OFF 토글 */}
      <View style={styles.notifToggleCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.notifToggleTitle}>{t('settings.pushTitle')}</Text>
          <Text
            style={[
              styles.notifToggleStatus,
              { color: notifEnabled ? COLORS.ember : COLORS.ink3 },
            ]}
          >
            {notifEnabled ? t('settings.pushOn') : t('settings.pushOff')}
          </Text>
        </View>
        <Switch
          value={notifEnabled}
          onValueChange={handleToggleNotifications}
          disabled={notifToggling}
          trackColor={{ false: COLORS.paper3, true: COLORS.ember }}
          thumbColor={'#ffffff'}
        />
      </View>

      {/* 시간대 선택 (알림 켜져있을 때만 활성) */}
      {notifEnabled && (
        <View style={styles.slotsCard}>
          <Text style={styles.slotsTitle}>{t('settings.slotsTitle')}</Text>
          <Text style={styles.slotsSub}>{t('settings.slotsSub')}</Text>
          <View style={styles.slotsRow}>
            {(['morning', 'lunch', 'evening'] as NotifSlot[]).map((s) => {
              const active = slots.includes(s);
              const cfg = SLOT_CONFIG[s];
              const timeLabel = `${cfg.hour.toString().padStart(2, '0')}:${cfg.minute
                .toString()
                .padStart(2, '0')}`;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.slotChip, active && styles.slotChipActive]}
                  onPress={() => toggleSlot(s)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.slotChipLabel, active && styles.slotChipLabelActive]}>
                    {t(SLOT_LABEL_KEY[s])}
                  </Text>
                  <Text style={[styles.slotChipTime, active && styles.slotChipTimeActive]}>
                    {timeLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {slots.length === 0 && (
            <Text style={styles.slotsWarn}>{t('settings.slotsWarn')}</Text>
          )}
        </View>
      )}

      <View style={styles.divider} />

      {/* 피드백 / 버그 신고 */}
      <TouchableOpacity style={styles.feedbackButton} onPress={handleFeedback}>
        <Text style={styles.feedbackButtonText}>{t('settings.feedbackButton')}</Text>
      </TouchableOpacity>
      <Text style={styles.feedbackHint}>{t('settings.feedbackHint')}</Text>

      <View style={styles.divider} />

      {isGuest ? (
        <>
          {/* 게스트: 구글 로그인 유도 + 게스트 종료 */}
          <TouchableOpacity
            style={[styles.primaryButton, upgrading && styles.buttonDisabled]}
            onPress={handleGuestUpgrade}
            disabled={upgrading}
          >
            <Text style={styles.primaryButtonText}>{t('settings.guestUpgrade')}</Text>
          </TouchableOpacity>
          <Text style={styles.feedbackHint}>{t('settings.guestUpgradeHint')}</Text>

          <TouchableOpacity style={styles.logoutButton} onPress={() => signOut()}>
            <Text style={styles.logoutButtonText}>{t('settings.exitGuest')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>{t('settings.logout')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deleteAccountButton, deleting && styles.buttonDisabled]}
            onPress={handleDeleteAccount}
            disabled={deleting}
          >
            <Text style={styles.deleteAccountText}>
              {deleting ? t('settings.deleting') : t('settings.deleteAccount')}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* 약관 / 개인정보처리방침 */}
      <View style={styles.legalRow}>
        <Text style={styles.legalLink} onPress={() => openLegal('terms')}>
          {t('settings.terms')}
        </Text>
        <Text style={styles.legalDot}>·</Text>
        <Text style={styles.legalLink} onPress={() => openLegal('privacy-policy')}>
          {t('settings.privacy')}
        </Text>
      </View>

      {/* 앱 정보 */}
      <View style={styles.appInfo}>
        <Text style={styles.appName}>하우웨더유</Text>
        <Text style={styles.appVersion}>v1.1.4</Text>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  crown: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  container: { padding: 26, paddingTop: 60, paddingBottom: 40 },
  heading: { fontFamily: FONTS.serifKoBold, fontSize: 27, color: COLORS.ink, marginBottom: 22 },
  section: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  sectionTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '600', marginBottom: 10 },
  desc: { color: COLORS.ink2, fontSize: 13.5, lineHeight: 21, marginBottom: 10 },
  subDesc: { color: COLORS.ink3, fontSize: 12, lineHeight: 19 },
  primaryButton: {
    backgroundColor: COLORS.ember,
    borderRadius: RADII.btn,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: { color: COLORS.emberText, fontSize: 15, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    padding: 18,
    marginBottom: 12,
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  userAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.ember,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { fontFamily: FONTS.serifEn, color: COLORS.emberText, fontSize: 21 },
  userName: { color: COLORS.ink, fontSize: 15, fontWeight: '600' },
  userEmail: { fontFamily: FONTS.mono, color: COLORS.ink3, fontSize: 11.5, marginTop: 3 },
  divider: { height: 1, backgroundColor: COLORS.line, marginVertical: 16 },
  notifToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  notifToggleTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '600' },
  notifToggleStatus: { fontSize: 12, marginTop: 4 },
  slotsCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    padding: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  slotsTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  slotsSub: { color: COLORS.ink3, fontSize: 12, marginBottom: 14 },
  slotsRow: { flexDirection: 'row', gap: 8 },
  slotChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: COLORS.paper,
    alignItems: 'center',
  },
  slotChipActive: { borderColor: COLORS.ember, backgroundColor: COLORS.emberSoft },
  slotChipLabel: { color: COLORS.ink2, fontSize: 13.5, fontWeight: '600', marginBottom: 4 },
  slotChipLabelActive: { color: COLORS.emberD },
  slotChipTime: { fontFamily: FONTS.mono, color: COLORS.ink3, fontSize: 10.5 },
  slotChipTimeActive: { color: COLORS.ember },
  slotsWarn: { color: COLORS.danger, fontSize: 12, marginTop: 10, textAlign: 'center' },
  feedbackButton: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  feedbackButtonText: { color: COLORS.teal, fontSize: 14, fontWeight: '600' },
  feedbackHint: { color: COLORS.ink3, fontSize: 11.5, textAlign: 'center', marginTop: 8 },
  logoutButton: { paddingVertical: 14, alignItems: 'center' },
  logoutButtonText: { color: COLORS.danger, fontSize: 14, fontWeight: '500' },
  deleteAccountButton: { paddingVertical: 12, alignItems: 'center', marginTop: 2 },
  deleteAccountText: { color: COLORS.ink3, fontSize: 12.5, textDecorationLine: 'underline' },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 28 },
  legalLink: { color: COLORS.ink3, fontSize: 12, textDecorationLine: 'underline' },
  legalDot: { color: COLORS.ink3, fontSize: 12 },
  appInfo: { alignItems: 'center', marginTop: 18 },
  appName: { fontFamily: FONTS.serifKo, color: COLORS.ink3, fontSize: 13, letterSpacing: 2 },
  appVersion: { fontFamily: FONTS.mono, color: COLORS.ink3, fontSize: 11, marginTop: 4, opacity: 0.7 },
});
