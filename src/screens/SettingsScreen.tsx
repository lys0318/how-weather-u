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

const SLOT_LABEL_KEY: Record<NotifSlot, string> = {
  morning: 'settings.slotMorning',
  lunch: 'settings.slotLunch',
  evening: 'settings.slotEvening',
};

export default function SettingsScreen() {
  const { user, signOut, deleteAccount, isGuest, signInWithGoogle } = useAuth();
  const { t, lang, setLang } = useI18n();
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

  return (
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
              { color: notifEnabled ? '#7ec9ff' : '#888' },
            ]}
          >
            {notifEnabled ? t('settings.pushOn') : t('settings.pushOff')}
          </Text>
        </View>
        <Switch
          value={notifEnabled}
          onValueChange={handleToggleNotifications}
          disabled={notifToggling}
          trackColor={{ false: '#2a2a2a', true: '#3a7fb8' }}
          thumbColor={notifEnabled ? '#ffffff' : '#777'}
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

      {/* 앱 정보 */}
      <View style={styles.appInfo}>
        <Text style={styles.appName}>하우웨더유</Text>
        <Text style={styles.appVersion}>v1.0.18</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0f0f0f' },
  container: { padding: 24, paddingTop: 60 },
  heading: { fontSize: 26, fontWeight: 'bold', color: '#fff', marginBottom: 32 },
  section: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
  },
  sectionTitle: { color: '#aaa', fontSize: 13, marginBottom: 14 },
  desc: {
    color: '#dddddd',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  subDesc: {
    color: '#777',
    fontSize: 12,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#000', fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  secondaryButtonText: { color: '#888', fontSize: 14 },
  tertiaryButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  tertiaryButtonText: { color: '#444', fontSize: 14 },
  buttonDisabled: { opacity: 0.5 },
  // 사용자 카드
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    gap: 14,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2e7dc4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  userName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  userEmail: {
    color: '#777',
    fontSize: 12,
    marginTop: 2,
  },
  // 로그아웃
  divider: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginVertical: 18,
  },
  notifToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 10,
    gap: 12,
  },
  notifToggleTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  slotsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 18,
    marginBottom: 10,
  },
  slotsTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  slotsSub: {
    color: '#888',
    fontSize: 12,
    marginBottom: 14,
  },
  slotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  slotChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    backgroundColor: '#111',
    alignItems: 'center',
  },
  slotChipActive: {
    borderColor: '#3a7fb8',
    backgroundColor: 'rgba(58, 127, 184, 0.18)',
  },
  slotChipLabel: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  slotChipLabelActive: {
    color: '#ffffff',
  },
  slotChipTime: {
    color: '#555',
    fontSize: 11,
  },
  slotChipTimeActive: {
    color: '#7ec9ff',
  },
  slotsWarn: {
    color: '#cc6666',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
  },
  notifToggleStatus: {
    fontSize: 12,
    marginTop: 4,
  },
  feedbackButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  feedbackButtonText: {
    color: '#d4a8e8',
    fontSize: 14,
    fontWeight: '600',
  },
  feedbackHint: {
    color: '#555',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  logoutButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#cc6666',
    fontSize: 14,
    fontWeight: '500',
  },
  deleteAccountButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 2,
  },
  deleteAccountText: {
    color: '#666',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  appInfo: {
    alignItems: 'center',
    marginTop: 40,
  },
  appName: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 13,
    letterSpacing: 2,
  },
  appVersion: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 11,
    marginTop: 4,
  },
});
