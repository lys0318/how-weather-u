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

export default function SettingsScreen() {
  const { user, signOut, deleteAccount } = useAuth();
  const [deleting, setDeleting] = useState(false);
  // 알림 활성화 상태 (Switch에 바인딩) — 디폴트 OFF
  const [notifEnabled, setNotifEnabled] = useState<boolean>(false);
  const [notifToggling, setNotifToggling] = useState(false);
  // 선택된 시간대 (아침/점심/저녁)
  const [slots, setSlots] = useState<NotifSlot[]>(['morning', 'lunch', 'evening']);

  const userName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    '게스트';
  const userEmail = user?.email || '';

  const handleLogout = () => {
    Alert.alert(
      '로그아웃',
      '로그아웃하시겠어요? 다시 로그인하면 같은 계정으로 들어올 수 있어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
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
      '계정 탈퇴',
      '계정을 정말 탈퇴하시겠어요?\n\n' +
        '• 계정 정보, 사용 기록, 북마크가 모두 영구 삭제돼요\n' +
        '• 삭제된 데이터는 복구할 수 없어요\n' +
        '• 동일 구글 계정으로 다시 가입은 가능해요',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '계속',
          style: 'destructive',
          onPress: () => {
            // 두 번째 확인
            Alert.alert(
              '마지막 확인',
              '정말 탈퇴를 진행할까요? 이 작업은 되돌릴 수 없어요.',
              [
                { text: '아니요', style: 'cancel' },
                {
                  text: '네, 탈퇴할게요',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await deleteAccount();
                      // 성공 시 자동으로 로그인 화면으로 라우팅됨 (세션 클리어)
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e);
                      Alert.alert('탈퇴 실패', `오류가 발생했어요: ${msg}`);
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
          Alert.alert('알림 권한 필요', '알림 권한이 없어요.', [
            { text: '설정 앱 열기', onPress: () => Linking.openSettings() },
            { text: '취소', style: 'cancel' },
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
      Alert.alert('오류', `알림 설정 변경 실패: ${msg}`);
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
        Alert.alert('오류', '브라우저를 열 수 없어요.');
        return;
      }
      await Linking.openURL(FEEDBACK_URL);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('오류', `피드백 페이지 열기 실패: ${msg}`);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.heading}>설정</Text>

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

      {/* 알림 안내 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>알림</Text>
        <Text style={styles.desc}>
          푸시 알림을 켜면 원하는 시간대에{'\n'}
          메시지를 받으러 오라고 살짝 알려드려요.
        </Text>
        <Text style={styles.subDesc}>
          • 아침 08:00 / 점심 12:30 / 저녁 19:00{'\n'}
          • 원하는 시간대만 선택해서 받을 수 있어요
        </Text>
      </View>

      {/* 알림 ON/OFF 토글 */}
      <View style={styles.notifToggleCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.notifToggleTitle}>푸시 알림</Text>
          <Text
            style={[
              styles.notifToggleStatus,
              { color: notifEnabled ? '#7ec9ff' : '#888' },
            ]}
          >
            {notifEnabled ? '알림이 활성화됨' : '알림이 해제됨'}
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
          <Text style={styles.slotsTitle}>받을 시간대를 골라주세요</Text>
          <Text style={styles.slotsSub}>선택한 시간대에만 알림이 와요</Text>
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
                    {cfg.label}
                  </Text>
                  <Text style={[styles.slotChipTime, active && styles.slotChipTimeActive]}>
                    {timeLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {slots.length === 0 && (
            <Text style={styles.slotsWarn}>한 개 이상 선택해주세요</Text>
          )}
        </View>
      )}

      <View style={styles.divider} />

      {/* 피드백 / 버그 신고 */}
      <TouchableOpacity style={styles.feedbackButton} onPress={handleFeedback}>
        <Text style={styles.feedbackButtonText}>💬 버그 신고 / 개선 의견 보내기</Text>
      </TouchableOpacity>
      <Text style={styles.feedbackHint}>
        의견 주시면 빠르게 반영할게요!
      </Text>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>로그아웃</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.deleteAccountButton, deleting && styles.buttonDisabled]}
        onPress={handleDeleteAccount}
        disabled={deleting}
      >
        <Text style={styles.deleteAccountText}>
          {deleting ? '탈퇴 처리 중...' : '계정 탈퇴'}
        </Text>
      </TouchableOpacity>

      {/* 앱 정보 */}
      <View style={styles.appInfo}>
        <Text style={styles.appName}>하우웨더유</Text>
        <Text style={styles.appVersion}>v1.0.15</Text>
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
