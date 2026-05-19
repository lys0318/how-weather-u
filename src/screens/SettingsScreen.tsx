import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { getIntervalHours, getDndRange } from '../utils/storage';
import {
  requestNotificationPermission,
  sendTestNotification,
  scheduleUpcomingNotifications,
  cancelAllNotifications,
} from '../services/notification';
import { useAuth } from '../contexts/AuthContext';

export default function SettingsScreen() {
  const [testSending, setTestSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { user, signOut, deleteAccount } = useAuth();
  const [deleting, setDeleting] = useState(false);

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

  // 첫 진입 시, 알림이 한 번도 예약된 적이 없으면 기본값으로 자동 예약
  useEffect(() => {
    (async () => {
      try {
        const iv = await getIntervalHours();
        const dnd = await getDndRange();
        // 백그라운드에서 한 번만 자동 보충 시도 (실패해도 무시)
        await scheduleUpcomingNotifications(iv, dnd.enabled, dnd.start, dnd.end);
      } catch {}
    })();
  }, []);

  const handleResetNotifications = async () => {
    setResetting(true);
    try {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          '알림 권한 필요',
          '알림 권한이 없어요.',
          [
            { text: '설정 앱 열기', onPress: () => Linking.openSettings() },
            { text: '취소', style: 'cancel' },
          ],
        );
        return;
      }
      const iv = await getIntervalHours();
      const dnd = await getDndRange();
      await scheduleUpcomingNotifications(iv, dnd.enabled, dnd.start, dnd.end);
      Alert.alert('완료', '알림을 새로 등록했어요.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('오류', `알림 등록 실패: ${msg}`);
    } finally {
      setResetting(false);
    }
  };

  const handleTestNotification = async () => {
    setTestSending(true);
    try {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert('알림 권한 필요', '알림 권한을 먼저 허용해주세요.');
        return;
      }
      await sendTestNotification();
      Alert.alert('전송 완료', '잠시 후 테스트 알림이 도착해요.');
    } catch {
      Alert.alert('오류', '테스트 알림 전송에 실패했습니다.');
    } finally {
      setTestSending(false);
    }
  };

  const handleStop = async () => {
    await cancelAllNotifications();
    Alert.alert('알림 중지', '예약된 알림을 모두 취소했습니다.');
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
          하우웨더유는 하루 중 적절한 시간대에 메시지를 받으러 오라고{'\n'}
          살짝 알려드려요.
        </Text>
        <Text style={styles.subDesc}>
          • 아침, 점심, 오후, 저녁마다 한 번씩{'\n'}
          • 새벽 1시 ~ 오전 6시는 방해하지 않아요
        </Text>
      </View>

      {/* 액션 버튼들 */}
      <TouchableOpacity
        style={[styles.primaryButton, resetting && styles.buttonDisabled]}
        onPress={handleResetNotifications}
        disabled={resetting}
      >
        <Text style={styles.primaryButtonText}>
          {resetting ? '등록 중...' : '알림 다시 등록하기'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryButton, testSending && styles.buttonDisabled]}
        onPress={handleTestNotification}
        disabled={testSending}
      >
        <Text style={styles.secondaryButtonText}>
          {testSending ? '전송 중...' : '🔔 테스트 알림 받기'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tertiaryButton} onPress={handleStop}>
        <Text style={styles.tertiaryButtonText}>알림 끄기</Text>
      </TouchableOpacity>

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
        <Text style={styles.appVersion}>v1.0.0</Text>
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
