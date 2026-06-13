import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { requestLocationPermission } from '../services/weather';
import { requestNotificationPermission } from '../services/notification';
import { setHasOnboarded } from '../utils/storage';
import { useI18n } from '../i18n';

interface Props {
  onDone: () => void;
}

export default function PermissionSetupScreen({ onDone }: Props) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [locStatus, setLocStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [notifStatus, setNotifStatus] = useState<'pending' | 'granted' | 'denied'>('pending');

  const userName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    (user?.email?.split('@')[0] ?? '');

  const handleStart = async () => {
    setLoading(true);
    try {
      // 1. 위치 권한
      const locOk = await requestLocationPermission();
      setLocStatus(locOk ? 'granted' : 'denied');

      // 2. 알림 권한 (권한만 받아두고 자동 예약은 안 함 — 사용자가 설정에서 직접 켜야 함)
      const notifOk = await requestNotificationPermission();
      setNotifStatus(notifOk ? 'granted' : 'denied');

      // 3. 둘 다 거부해도 그냥 진행 (앱은 권한 없이도 일부 사용 가능)
      await setHasOnboarded(true);
      onDone();
    } catch (e) {
      // 권한 거부도 정상 흐름. 그냥 통과.
      await setHasOnboarded(true);
      onDone();
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#0a1228', '#1a2350', '#5a3870', '#c36c80']}
      style={styles.gradient}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.welcomeEmoji}>👋</Text>
          <Text style={styles.welcomeText}>
            {userName ? t('permission.welcome', { name: userName }) : t('permission.welcomeNoName')}
          </Text>
          <Text style={styles.desc}>{t('permission.desc')}</Text>

          <View style={styles.permList}>
            <PermissionRow
              emoji="📍"
              title={t('permission.locationTitle')}
              desc={t('permission.locationDesc')}
            />
            <PermissionRow
              emoji="🔔"
              title={t('permission.notifTitle')}
              desc={t('permission.notifDesc')}
            />
          </View>

          <Text style={styles.note}>{t('permission.note')}</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleStart}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0f0f0f" size="small" />
          ) : (
            <Text style={styles.buttonText}>{t('permission.startButton')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

function PermissionRow({
  emoji,
  title,
  desc,
}: {
  emoji: string;
  title: string;
  desc: string;
}) {
  return (
    <View style={styles.permRow}>
      <Text style={styles.permEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.permTitle}>{title}</Text>
        <Text style={styles.permDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 100,
    paddingBottom: 56,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    marginTop: 20,
  },
  welcomeEmoji: { fontSize: 56 },
  welcomeText: {
    fontSize: 28,
    color: '#ffffff',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 38,
  },
  desc: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: 32,
    lineHeight: 24,
    fontWeight: '300',
  },
  permList: {
    width: '100%',
    marginTop: 36,
    gap: 14,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  permEmoji: { fontSize: 28 },
  permTitle: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  permDesc: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    marginTop: 2,
  },
  note: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 28,
  },
  button: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
});
