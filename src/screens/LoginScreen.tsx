import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n';
import { COLORS, FONTS, RADII } from '../constants/theme';
import SkyBackground, { getPaperTint } from '../components/SkyBackground';

export default function LoginScreen() {
  const { signInWithGoogle, signInAsGuest } = useAuth();
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);

  // 약관 / 개인정보처리방침 — 현재 언어에 맞는 페이지로
  const openLegal = (doc: 'terms' | 'privacy-policy') => {
    const url = `https://how-weather-u.pages.dev/${doc}${lang === 'en' ? '-en' : ''}.html`;
    Linking.openURL(url).catch(() => {});
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('login.genericError');
      Alert.alert(t('login.failTitle'), msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setGuestLoading(true);
    try {
      await signInAsGuest();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('login.guestError');
      Alert.alert(t('login.guestFailTitle'), msg);
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: getPaperTint('dusk') }]}>
      <View style={styles.skyWrap}>
        <SkyBackground kind="dusk" />
      </View>

      <View style={styles.content}>
        {/* 브랜드 — 하늘 위 */}
        <View style={styles.brand}>
          <Text style={styles.mark}>하우웨더유</Text>
          <Text style={styles.markEn}>HOW WEATHER YOU</Text>
        </View>

        {/* 시 + 액션 — 페이퍼 위 */}
        <View>
          <Text style={styles.poem}>{t('login.tagline')}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.googleButton, loading && styles.disabled]}
              onPress={handleGoogleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.ink} size="small" />
              ) : (
                <>
                  <Text style={styles.googleG}>G</Text>
                  <Text style={styles.googleButtonText}>{t('login.googleStart')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.guestButton, guestLoading && styles.disabled]}
              onPress={handleGuest}
              disabled={guestLoading || loading}
            >
              {guestLoading ? (
                <ActivityIndicator color={COLORS.ink2} size="small" />
              ) : (
                <Text style={styles.guestButtonText}>{t('login.guestStart')}</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.fineprint}>{t('login.agree')}</Text>
            <View style={styles.legalRow}>
              <Text style={styles.legalLink} onPress={() => openLegal('terms')}>
                {t('settings.terms')}
              </Text>
              <Text style={styles.legalDot}>·</Text>
              <Text style={styles.legalLink} onPress={() => openLegal('privacy-policy')}>
                {t('settings.privacy')}
              </Text>
            </View>
            <Text style={styles.guestNote}>{t('login.guestNote')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  skyWrap: { position: 'absolute', top: 0, left: 0, right: 0, height: '58%' },
  content: {
    flex: 1,
    paddingHorizontal: 30,
    paddingTop: 84,
    paddingBottom: 48,
    justifyContent: 'space-between',
  },
  brand: { alignItems: 'center', marginTop: 4 },
  mark: {
    fontFamily: FONTS.serifKoBold,
    fontSize: 42,
    color: '#fff',
    letterSpacing: 2,
    textShadowColor: 'rgba(40,30,50,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 22,
  },
  markEn: {
    fontFamily: FONTS.mono,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.74)',
    letterSpacing: 4,
    marginTop: 13,
    paddingLeft: 4,
  },
  poem: {
    fontFamily: FONTS.serifKo,
    fontSize: 21,
    color: COLORS.ink,
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 30,
  },
  actions: { alignItems: 'center' },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADII.btn,
    paddingVertical: 17,
    paddingHorizontal: 24,
    width: '100%',
    gap: 11,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  googleG: { fontFamily: FONTS.serifEn, fontSize: 19, color: COLORS.ember, fontWeight: '500' },
  googleButtonText: { fontSize: 15.5, color: COLORS.ink, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  guestButton: { marginTop: 22, paddingVertical: 8, alignItems: 'center' },
  guestButtonText: {
    color: COLORS.ink2,
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  fineprint: {
    fontSize: 11,
    color: COLORS.ink3,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 17,
  },
  guestNote: { fontSize: 11, color: COLORS.ink3, textAlign: 'center', marginTop: 8 },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8 },
  legalLink: { fontSize: 11, color: COLORS.ink2, textDecorationLine: 'underline' },
  legalDot: { fontSize: 11, color: COLORS.ink3 },
});
