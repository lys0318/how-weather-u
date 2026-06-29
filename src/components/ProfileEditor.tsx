import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Pressable,
  ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { COLORS, FONTS, RADII } from '../constants/theme';
import { useI18n } from '../i18n';
import { getMyProfile, upsertMyProfile } from '../services/profile';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const AGES = ['10s', '20s', '30s', '40s', '50s', 'private'] as const;
const OCCS = ['student', 'worker', 'homemaker', 'jobseeker', 'etc'] as const;
const AGE_KEY: Record<string, string> = {
  '10s': 'profile.age10s', '20s': 'profile.age20s', '30s': 'profile.age30s',
  '40s': 'profile.age40s', '50s': 'profile.age50s', private: 'profile.agePrivate',
};
const OCC_KEY: Record<string, string> = {
  student: 'profile.occStudent', worker: 'profile.occWorker', homemaker: 'profile.occHomemaker',
  jobseeker: 'profile.occJobseeker', etc: 'profile.occEtc',
};

export default function ProfileEditor({ visible, onClose }: Props) {
  const { t } = useI18n();
  const [nickname, setNickname] = useState('');
  const [ageBand, setAgeBand] = useState<string | undefined>();
  const [occupation, setOccupation] = useState<string | undefined>();
  const [interests, setInterests] = useState('');
  const [concern, setConcern] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getMyProfile()
      .then((p) => {
        setNickname(p?.nickname ?? '');
        setAgeBand(p?.ageBand);
        setOccupation(p?.occupation);
        setInterests(p?.interests ?? '');
        setConcern(p?.concern ?? '');
      })
      .finally(() => setLoading(false));
  }, [visible]);

  const toggle = (cur: string | undefined, v: string, set: (x?: string) => void) =>
    set(cur === v ? undefined : v);

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertMyProfile({ nickname, ageBand, occupation, interests, concern });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('profile.title'), t('profile.saveFail', { msg }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grip} />
          <Text style={styles.title}>{t('profile.title')}</Text>
          <Text style={styles.intro}>{t('profile.intro')}</Text>

          {loading ? (
            <ActivityIndicator color={COLORS.ember} style={{ marginVertical: 30 }} />
          ) : (
            <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>{t('profile.nicknameLabel')}</Text>
              <TextInput
                style={styles.input} value={nickname} onChangeText={setNickname}
                placeholder={t('profile.nicknamePh')} placeholderTextColor={COLORS.ink3} maxLength={20}
              />

              <Text style={styles.label}>{t('profile.ageLabel')}</Text>
              <View style={styles.chipRow}>
                {AGES.map((a) => (
                  <TouchableOpacity key={a}
                    style={[styles.chip, ageBand === a && styles.chipOn]}
                    onPress={() => toggle(ageBand, a, setAgeBand)}>
                    <Text style={[styles.chipText, ageBand === a && styles.chipTextOn]}>{t(AGE_KEY[a])}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>{t('profile.occLabel')}</Text>
              <View style={styles.chipRow}>
                {OCCS.map((o) => (
                  <TouchableOpacity key={o}
                    style={[styles.chip, occupation === o && styles.chipOn]}
                    onPress={() => toggle(occupation, o, setOccupation)}>
                    <Text style={[styles.chipText, occupation === o && styles.chipTextOn]}>{t(OCC_KEY[o])}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>{t('profile.interestsLabel')}</Text>
              <TextInput
                style={styles.input} value={interests} onChangeText={setInterests}
                placeholder={t('profile.interestsPh')} placeholderTextColor={COLORS.ink3} maxLength={100}
              />

              <Text style={styles.label}>{t('profile.concernLabel')}</Text>
              <TextInput
                style={[styles.input, styles.multiline]} value={concern} onChangeText={setConcern}
                placeholder={t('profile.concernPh')} placeholderTextColor={COLORS.ink3} maxLength={200} multiline
              />
            </ScrollView>
          )}

          <TouchableOpacity style={[styles.save, saving && styles.disabled]} onPress={handleSave} disabled={saving || loading}>
            {saving ? <ActivityIndicator color={COLORS.emberText} size="small" />
              : <Text style={styles.saveText}>{t('profile.save')}</Text>}
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(28,22,30,0.42)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: RADII.sheet, borderTopRightRadius: RADII.sheet,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 30,
  },
  grip: { width: 38, height: 4, borderRadius: 4, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: FONTS.serifKo, color: COLORS.ink, fontSize: 21, textAlign: 'center' },
  intro: { color: COLORS.ink3, fontSize: 12.5, textAlign: 'center', marginTop: 6, marginBottom: 16, lineHeight: 18 },
  label: { color: COLORS.ink2, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: COLORS.line, borderRadius: RADII.card,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14.5,
    color: COLORS.ink, backgroundColor: COLORS.card,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999,
    borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.card,
  },
  chipOn: { borderColor: COLORS.ember, backgroundColor: COLORS.emberSoft },
  chipText: { color: COLORS.ink2, fontSize: 13.5, fontWeight: '600' },
  chipTextOn: { color: COLORS.emberD },
  save: { backgroundColor: COLORS.ember, borderRadius: RADII.btn, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  saveText: { color: COLORS.emberText, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
