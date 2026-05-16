import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Dimensions,
} from 'react-native';
import { requestLocationPermission } from '../services/weather';
import {
  requestNotificationPermission,
  scheduleUpcomingNotifications,
} from '../services/notification';
import { setHasOnboarded, setIntervalHours, getDndRange } from '../utils/storage';

const { width } = Dimensions.get('window');

type Step = 'welcome' | 'location' | 'notification' | 'interval' | 'done';

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState<1 | 2 | 3>(2);

  const handleLocationStep = async () => {
    setLoading(true);
    try {
      const granted = await requestLocationPermission();
      if (!granted) {
        Alert.alert(
          '위치 권한 필요',
          '날씨를 가져오려면 위치 권한이 필요해요.',
          [
            {
              text: '설정 앱 열기',
              onPress: () => {
                Linking.openSettings();
                setStep('notification');
              },
            },
            { text: '나중에', style: 'cancel', onPress: () => setStep('notification') },
          ]
        );
        return;
      }
      setStep('notification');
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationStep = async () => {
    setLoading(true);
    try {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          '알림 권한 필요',
          '날씨 메시지를 받으려면 알림 권한이 필요해요.',
          [
            {
              text: '설정 앱 열기',
              onPress: () => {
                Linking.openSettings();
                setStep('interval');
              },
            },
            { text: '나중에', style: 'cancel', onPress: () => setStep('interval') },
          ]
        );
        return;
      }
      setStep('interval');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await setIntervalHours(selectedInterval);
      const dnd = await getDndRange();
      await scheduleUpcomingNotifications(selectedInterval, dnd.enabled, dnd.start, dnd.end);
      await setHasOnboarded(true);
      onComplete();
    } catch (e) {
      Alert.alert('오류', '설정을 저장하는 중 문제가 발생했어요. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  // ── 단계별 렌더 ──────────────────────────────────────────

  if (step === 'welcome') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.emoji}>🌤️</Text>
          <Text style={styles.title}>하우웨더유</Text>
          <Text style={styles.subtitle}>How Weather You</Text>
          <Text style={styles.desc}>
            날씨, 요일, 시간대를 분석해{'\n'}
            AI가 오늘의 감성 메시지를 보내드려요.
          </Text>
        </View>
        <TouchableOpacity style={styles.button} onPress={() => setStep('location')}>
          <Text style={styles.buttonText}>시작하기</Text>
        </TouchableOpacity>
        <StepIndicator current={0} total={3} />
      </View>
    );
  }

  if (step === 'location') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.emoji}>📍</Text>
          <Text style={styles.stepTitle}>위치 권한</Text>
          <Text style={styles.desc}>
            현재 위치의 날씨를 가져오기 위해{'\n'}
            위치 접근 권한이 필요해요.
          </Text>
          <Text style={styles.note}>위치 정보는 날씨 조회에만 사용돼요</Text>
        </View>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLocationStep}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.buttonText}>위치 권한 허용</Text>
          )}
        </TouchableOpacity>
        <StepIndicator current={1} total={3} />
      </View>
    );
  }

  if (step === 'notification') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.emoji}>🔔</Text>
          <Text style={styles.stepTitle}>알림 권한</Text>
          <Text style={styles.desc}>
            날씨에 맞는 감성 메시지를{'\n'}
            주기적으로 알림으로 받아볼 수 있어요.
          </Text>
          <Text style={styles.note}>언제든 설정에서 끌 수 있어요</Text>
        </View>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleNotificationStep}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.buttonText}>알림 권한 허용</Text>
          )}
        </TouchableOpacity>
        <StepIndicator current={2} total={3} />
      </View>
    );
  }

  if (step === 'interval') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.emoji}>⏰</Text>
          <Text style={styles.stepTitle}>알림 주기</Text>
          <Text style={styles.desc}>얼마나 자주 메시지를 받고 싶으세요?</Text>
          <View style={styles.intervalRow}>
            {([1, 2, 3] as const).map((h) => (
              <TouchableOpacity
                key={h}
                style={[styles.intervalCard, selectedInterval === h && styles.intervalCardActive]}
                onPress={() => setSelectedInterval(h)}
              >
                <Text
                  style={[
                    styles.intervalNum,
                    selectedInterval === h && styles.intervalNumActive,
                  ]}
                >
                  {h}
                </Text>
                <Text
                  style={[
                    styles.intervalLabel,
                    selectedInterval === h && styles.intervalLabelActive,
                  ]}
                >
                  시간마다
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.note}>밤 11시 ~ 아침 7시는 자동으로 방해금지예요</Text>
        </View>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleComplete}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.buttonText}>시작하기 🎉</Text>
          )}
        </TouchableOpacity>
        <StepIndicator current={3} total={3} />
      </View>
    );
  }

  return null;
}

// ── 스텝 인디케이터 ────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.indicator}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.dot, i < current && styles.dotActive]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingHorizontal: 28,
    paddingTop: 80,
    paddingBottom: 48,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    marginTop: 6,
    marginBottom: 28,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  desc: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 16,
  },
  note: {
    fontSize: 12,
    color: '#444',
    textAlign: 'center',
    marginTop: 8,
  },
  button: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  // 취향 선택
  optionRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 20,
  },
  optionCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1a1a1a',
  },
  optionCardActive: {
    borderColor: '#ffffff',
    backgroundColor: '#222',
  },
  optionEmoji: {
    fontSize: 32,
    marginBottom: 10,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#666',
    marginBottom: 6,
  },
  optionLabelActive: {
    color: '#ffffff',
  },
  optionDesc: {
    fontSize: 12,
    color: '#444',
    textAlign: 'center',
  },
  // 알림 주기
  intervalRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
  },
  intervalCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 22,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1a1a1a',
  },
  intervalCardActive: {
    borderColor: '#ffffff',
    backgroundColor: '#222',
  },
  intervalNum: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#555',
  },
  intervalNumActive: {
    color: '#ffffff',
  },
  intervalLabel: {
    fontSize: 12,
    color: '#444',
    marginTop: 4,
  },
  intervalLabelActive: {
    color: '#aaa',
  },
  // 스텝 인디케이터
  indicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#333',
  },
  dotActive: {
    backgroundColor: '#ffffff',
    width: 18,
  },
});
