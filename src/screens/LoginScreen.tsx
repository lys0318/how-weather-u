import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen() {
  const { signInWithGoogle, getDebug } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '로그인 중 오류가 발생했어요.';
      Alert.alert('로그인 실패', `${msg}\n\n--- 진단 정보 ---${getDebug()}`);
    } finally {
      setLoading(false);
    }
  };

  const showDebug = () => {
    Alert.alert('진단 정보', getDebug() || '(아직 시도 안 함)');
  };

  return (
    <LinearGradient
      colors={['#0a1228', '#1a2350', '#5a3870', '#c36c80']}
      style={styles.gradient}
    >
      <View style={styles.container}>
        {/* 브랜드 */}
        <View style={styles.brand}>
          <Text style={styles.appName}>하우웨더유</Text>
          <Text style={styles.tagline}>How Weather You</Text>
          <Text style={styles.desc}>
            오늘의 날씨가{'\n'}
            당신에게 건네는 한마디
          </Text>
        </View>

        {/* 로그인 버튼 */}
        <View style={styles.buttonArea}>
          <TouchableOpacity
            style={[styles.googleButton, loading && styles.disabled]}
            onPress={handleGoogleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#0f0f0f" size="small" />
            ) : (
              <>
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.googleButtonText}>구글로 시작하기</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.privacy}>
            로그인하시면 이용약관 및{'\n'}개인정보처리방침에 동의하게 돼요
          </Text>

          <TouchableOpacity onPress={showDebug} style={styles.debugBtn}>
            <Text style={styles.debugText}>진단 정보 보기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 36,
    paddingTop: 100,
    paddingBottom: 56,
    justifyContent: 'space-between',
  },
  brand: {
    alignItems: 'center',
    marginTop: 60,
  },
  appName: {
    fontSize: 38,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
    letterSpacing: 2,
  },
  desc: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 40,
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '300',
  },
  buttonArea: {
    alignItems: 'center',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 17,
    paddingHorizontal: 24,
    width: '100%',
    gap: 12,
  },
  googleG: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
    fontFamily: 'sans-serif',
  },
  googleButtonText: {
    fontSize: 16,
    color: '#0f0f0f',
    fontWeight: '600',
  },
  disabled: { opacity: 0.5 },
  privacy: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 16,
  },
  debugBtn: {
    marginTop: 18,
    paddingVertical: 6,
  },
  debugText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textDecorationLine: 'underline',
  },
});
