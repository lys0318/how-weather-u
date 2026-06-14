import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { requestLocationPermission } from '../services/weather';
import { requestNotificationPermission } from '../services/notification';
import { setHasOnboarded } from '../utils/storage';
import { useI18n } from '../i18n';
import { COLORS, FONTS, RADII } from '../constants/theme';
import SkyBackground, { getPaperTint } from '../components/SkyBackground';
import Grain from '../components/Grain';

interface Props {
  onDone: () => void;
}

export default function PermissionSetupScreen({ onDone }: Props) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const userName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    (user?.email?.split('@')[0] ?? '');

  const handleStart = async () => {
    setLoading(true);
    try {
      await requestLocationPermission();
      await requestNotificationPermission();
      await setHasOnboarded(true);
      onDone();
    } catch (e) {
      await setHasOnboarded(true);
      onDone();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: getPaperTint('day') }]}>
      <View style={styles.skyWrap}>
        <SkyBackground kind="day" />
      </View>

      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.kicker}>WELCOME</Text>
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
            <ActivityIndicator color={COLORS.paper} size="small" />
          ) : (
            <Text style={styles.buttonText}>{t('permission.startButton')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <Grain />
    </View>
  );
}

function PermissionRow({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <View style={styles.permRow}>
      <View style={styles.permStamp}>
        <Text style={styles.permEmoji}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.permTitle}>{title}</Text>
        <Text style={styles.permDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  skyWrap: { position: 'absolute', top: 0, left: 0, right: 0, height: '42%' },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 44,
    justifyContent: 'space-between',
  },
  content: { flex: 1 },
  kicker: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 4,
    color: 'rgba(255,255,255,0.8)',
  },
  welcomeText: {
    fontFamily: FONTS.serifKo,
    fontSize: 34,
    color: '#fff',
    marginTop: 14,
    lineHeight: 46,
    textShadowColor: 'rgba(40,30,50,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 18,
  },
  desc: {
    fontSize: 14.5,
    color: COLORS.ink2,
    marginTop: 30,
    lineHeight: 24,
  },
  permList: { marginTop: 26, gap: 12 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    padding: 17,
    gap: 15,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  permStamp: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.paper3,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permEmoji: { fontSize: 18 },
  permTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '600' },
  permDesc: { color: COLORS.ink3, fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  note: { fontSize: 12, color: COLORS.ink3, textAlign: 'center', marginTop: 22 },
  button: {
    backgroundColor: COLORS.ink,
    borderRadius: RADII.btn,
    paddingVertical: 17,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: COLORS.paper, fontSize: 15.5, fontWeight: '600' },
});
