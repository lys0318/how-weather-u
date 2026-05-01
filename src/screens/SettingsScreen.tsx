import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import {
  getIntervalHours,
  setIntervalHours,
  getPreference,
  setPreference,
  getDndRange,
  setDndRange,
} from '../utils/storage';
import { registerBackgroundTask, unregisterBackgroundTask } from '../tasks/backgroundTask';
import { requestNotificationPermission } from '../services/notification';

export default function SettingsScreen() {
  const [interval, setIntervalState] = useState<1 | 2 | 3>(2);
  const [preference, setPreferenceState] = useState<'comfort' | 'cheer'>('comfort');
  const [dndEnabled, setDndEnabled] = useState(true);
  const [dndStart, setDndStart] = useState(23);
  const [dndEnd, setDndEnd] = useState(7);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [iv, pref, dnd] = await Promise.all([
        getIntervalHours(),
        getPreference(),
        getDndRange(),
      ]);
      setIntervalState(iv);
      setPreferenceState(pref);
      setDndStart(dnd.start);
      setDndEnd(dnd.end);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert('알림 권한 필요', '설정 앱에서 알림 권한을 허용해주세요.');
        return;
      }

      await setIntervalHours(interval);
      await setPreference(preference);
      await setDndRange(dndEnabled ? dndStart : -1, dndEnabled ? dndEnd : -1);
      await registerBackgroundTask(interval);

      Alert.alert('저장 완료', `${interval}시간마다 날씨 메시지를 받아볼게요.`);
    } catch (e) {
      Alert.alert('오류', '설정 저장 중 문제가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleStop = async () => {
    await unregisterBackgroundTask();
    Alert.alert('알림 중지', '날씨 메시지 알림을 중지했습니다.');
  };

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
        {dndEnabled && (
          <Text style={styles.dndDesc}>
            밤 {dndStart}시 ~ 아침 {dndEnd}시 사이엔 알림을 보내지 않아요
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
  dndDesc: { color: '#555', fontSize: 13, marginTop: 10 },
  saveButton: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: '#000', fontSize: 15, fontWeight: '700' },
  stopButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  stopButtonText: { color: '#555', fontSize: 14 },
});
