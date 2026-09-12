import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useGuestUpgrade } from '../hooks/useGuestUpgrade';
import { useI18n } from '../i18n';
import { COLORS, RADII } from '../constants/theme';

/**
 * 게스트 → 정식 계정 전환 버튼 한 쌍.
 *
 * 전환 유도가 필요한 곳(홈 배너·히스토리 빈 화면·설정)에 공통으로 쓴다.
 * 이전에는 손해만 알려주고 버튼이 없거나, 있어도 구글만 걸려 있어서
 * 카카오로 가입하려는 사용자는 전환할 길이 없었다.
 */
export default function GuestSignInButtons() {
  const { t } = useI18n();
  const { upgrading, busy, upgradeWithGoogle, upgradeWithKakao } = useGuestUpgrade();

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.btn, styles.kakao, busy && styles.disabled]}
        onPress={upgradeWithKakao}
        disabled={busy}
      >
        {upgrading === 'kakao' ? (
          <ActivityIndicator color="#191919" size="small" />
        ) : (
          <Text style={styles.kakaoText}>{t('login.kakaoSignIn')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, styles.google, busy && styles.disabled]}
        onPress={upgradeWithGoogle}
        disabled={busy}
      >
        {upgrading === 'google' ? (
          <ActivityIndicator color={COLORS.ink} size="small" />
        ) : (
          <Text style={styles.googleText}>{t('login.googleSignIn')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: RADII.btn,
    minHeight: 42, // 로딩 인디케이터로 바뀔 때 높이가 흔들리지 않도록
  },
  // 카카오 브랜드 가이드 — 노란 배경에 어두운 텍스트
  kakao: { backgroundColor: '#FEE500' },
  kakaoText: { fontSize: 13.5, color: '#191919', fontWeight: '600' },
  google: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line },
  googleText: { fontSize: 13.5, color: COLORS.ink, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
