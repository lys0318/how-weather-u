import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  Linking,
} from 'react-native';
import {
  getIntervalHours,
  setIntervalHours,
  getPreference,
  setPreference,
  getDndRange,
  setDndRange,
} from '../utils/storage';
import {
  requestNotificationPermission,
  sendTestNotification,
  scheduleUpcomingNotifications,
  cancelAllNotifications,
} from '../services/notification';

// ── 시간 표시 헬퍼 ─────────────────────────────────────────
function formatHour(h: number): string {
  if (h < 0 || h > 23) return '?시';
  if (h === 0) return '자정';
  if (h < 6) return `새벽 ${h}시`;
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return '정오';
  if (h < 18) return `오후 ${h - 12}시`;
  if (h < 20) return `저녁 ${h - 12}시`;
  return `밤 ${h}시`;
}

// ── 다음 알림 예상 시각 계산 ──────────────────────────────
function getNextNotificationLabel(
  intervalHours: 1 | 2 | 3,
  dndEnabled: boolean,
  dndStart: number,
  dndEnd: number,
): string {
  const now = new Date();
  let nextHour = now.getHours() + intervalHours;

  if (dndEnabled) {
    const inDnd = (h: number) => {
      const hh = h % 24;
      return dndStart > dndEnd ? hh >= dndStart || hh < dndEnd : hh >= dndStart && hh < dndEnd;
    };
    if (inDnd(nextHour)) nextHour = dndEnd;
  }

  const displayHour = nextHour % 24;
  const diff = nextHour - now.getHours();
  const diffLabel = diff > 0 ? ` (약 ${diff}시간 후)` : '';
  return `${formatHour(displayHour)}경${diffLabel}`;
}

export default function SettingsScreen() {
  const [interval, setIntervalState] = useState<1 | 2 | 3>(2);
  const [preference, setPreferenceState] = useState<'comfort' | 'cheer'>('comfort');
  const [dndEnabled, setDndEnabled] = useState(true);
  const [dndStart, setDndStart] = useState(1);
  const [dndEnd, setDndEnd] = useState(6);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [iv, pref, dnd] = await Promise.all([
        getIntervalHours(),
        getPreference(),
        getDndRange(),
      ]);
      setIntervalState(iv);
      setPreferenceState(pref);
      setDndEnabled(dnd.enabled);
      setDndStart(dnd.start);
      setDndEnd(dnd.end);
      setLoaded(true);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
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

      await setIntervalHours(interval);
      await setPreference(preference);
      await setDndRange(dndEnabled, dndStart, dndEnd);

      // 앱 종료 시에도 동작하는 OS 예약 알림으로 48개 미리 등록
      await scheduleUpcomingNotifications(interval, dndEnabled, dndStart, dndEnd);

      const intervalLabel = interval === 1 ? '1시간' : interval === 2 ? '2시간' : '3시간';
      Alert.alert('저장 완료', `${intervalLabel}마다 날씨 알림을 받아볼게요.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('오류', `설정 저장 실패: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleStop = async () => {
    await cancelAllNotifications();
    Alert.alert('알림 중지', '날씨 메시지 알림을 모두 취소했습니다.');
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

  const nextLabel = loaded
    ? getNextNotificationLabel(interval, dndEnabled, dndStart, dndEnd)
    : '—';

  const dndDesc = dndEnabled
    ? `${formatHour(dndStart)} ~ ${formatHour(dndEnd)} 사이엔 알림을 보내지 않아요`
    : '방해금지가 꺼져 있어요. 언제든지 알림이 올 수 있어요.';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.heading}>설정</Text>

      {/* 알림 주기 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>알림 주기</Text>
        <View style={styles.row}>
          {([1, 2, 3] as const).map((h) => (
            <TouchableOpacity
              key={h}
              style={[styles.chip, interval === h && styles.chipActive]}
              onPress={() => setIntervalState(h)}
            >
              <Text style={[styles.chipText, interval === h && styles.chipTextActive]}>
                {h}시간
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.nextNotifRow}>
          <Text style={styles.nextNotifLabel}>다음 알림 예상</Text>
          <Text style={styles.nextNotifValue}>{nextLabel}</Text>
        </View>
      </View>

      {/* 메시지 톤 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>메시지 톤</Text>
        <View style={styles.row}>
          {([
            { key: 'comfort', label: '위로' },
            { key: 'cheer', label: '응원' },
          ] as const).map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.chip, preference === key && styles.chipActive]}
              onPress={() => setPreferenceState(key)}
            >
              <Text style={[styles.chipText, preference === key && styles.chipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 방해금지 */}
      <View style={styles.section}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>방해금지 시간대</Text>
          <Switch
            value={dndEnabled}
            onValueChange={setDndEnabled}
            trackColor={{ false: '#333', true: '#555' }}
            thumbColor={dndEnabled ? '#fff' : '#888'}
          />
        </View>
        <Text style={styles.dndDesc}>{dndDesc}</Text>
        {dndEnabled && (
          <Text style={styles.dndDefault}>
            기본: 새벽 1시 ~ 오전 6시
          </Text>
        )}
      </View>

      {/* 저장 버튼 */}
      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>{saving ? '저장 중...' : '설정 저장 및 알림 시작'}</Text>
      </TouchableOpacity>

      {/* 테스트 알림 */}
      <TouchableOpacity
        style={[styles.testButton, testSending && styles.saveButtonDisabled]}
        onPress={handleTestNotification}
        disabled={testSending}
      >
        <Text style={styles.testButtonText}>
          {testSending ? '전송 중...' : '🔔 테스트 알림 받기'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
        <Text style={styles.stopButtonText}>알림 중지</Text>
      </TouchableOpacity>
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
  row: { flexDirection: 'row', gap: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  chipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  chipText: { color: '#666', fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#000' },
  dndDesc: { color: '#666', fontSize: 13, marginTop: 10 },
  dndDefault: { color: '#444', fontSize: 12, marginTop: 6 },
  nextNotifRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  nextNotifLabel: { color: '#555', fontSize: 12 },
  nextNotifValue: { color: '#888', fontSize: 12 },
  saveButton: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: '#000', fontSize: 15, fontWeight: '700' },
  testButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  testButtonText: { color: '#888', fontSize: 14 },
  stopButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  stopButtonText: { color: '#444', fontSize: 14 },
});
