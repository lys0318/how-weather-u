import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { useWeather } from '../hooks/useWeather';
import { useMessage } from '../hooks/useMessage';
import { useActivity } from '../hooks/useActivity';
import { useFood } from '../hooks/useFood';
import { useFortune } from '../hooks/useFortune';
import { runWithGate } from '../hooks/useGenerationGate';
import { Preference, PREFERENCE_KO, PREFERENCE_EN, PREFERENCE_EMOJI } from '../constants/weather';
import AppBanner from '../components/AppBanner';
import NativeAdCard from '../components/NativeAdCard';
import { COLORS, FONTS, RADII } from '../constants/theme';
import { useI18n } from '../i18n';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { setStatusBarStyle } from 'expo-status-bar';

const PREF_ORDER: Preference[] = ['comfort', 'cheer', 'advice'];
const PREF_DESC_KEY: Record<Preference, string> = {
  comfort: 'home.prefComfortDesc',
  cheer: 'home.prefCheerDesc',
  advice: 'home.prefAdviceDesc',
};

export default function MessagingScreen() {
  const { weather } = useWeather();
  const { message, loading: msgLoading, generate: generateMsg } = useMessage();
  const { activity, loading: actLoading, generate: generateActivity } = useActivity();
  const { food, loading: foodLoading, generate: generateFood } = useFood();
  const { fortune, loading: fortLoading, generate: generateFortune } = useFortune();
  const { t, lang } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('dark');
    }, []),
  );

  const isEn = lang === 'en';
  const prefLabel = (p: Preference) => (isEn ? PREFERENCE_EN[p] : PREFERENCE_KO[p]);

  const handlePickPreference = (pref: Preference) => {
    setPickerOpen(false);
    if (!weather) return;
    runWithGate(() => generateMsg(weather, pref));
  };

  const handleActivity = () => {
    if (!weather) return;
    runWithGate(() => generateActivity(weather));
  };

  const handleFood = () => {
    if (!weather) return;
    runWithGate(() => generateFood(weather));
  };

  const handleFortune = () => {
    if (!weather) return;
    runWithGate(() => generateFortune(weather));
  };

  const noWeather = !weather;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('tabs.messaging')}</Text>

        {/* 오늘의 메시지 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardIcon}>💌</Text>
            <Text style={styles.cardLabel}>{t('home.getMessage')}</Text>
          </View>
          {message && (
            <Text style={styles.cardText}>{message.text}</Text>
          )}
          <TouchableOpacity
            style={[styles.btn, (msgLoading || noWeather) && styles.btnDisabled]}
            onPress={() => setPickerOpen(true)}
            disabled={msgLoading || noWeather}
          >
            {msgLoading ? (
              <ActivityIndicator color={COLORS.emberText} size="small" />
            ) : (
              <Text style={styles.btnText}>
                {message ? t('home.getAnotherMessage') : t('home.getMessage')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 활동 추천 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardIcon}>🌿</Text>
            <Text style={styles.cardLabel}>{t('home.activityLabel')}</Text>
          </View>
          {activity && (
            <Text style={styles.cardText}>{activity.text}</Text>
          )}
          <TouchableOpacity
            style={[styles.ghostBtn, (actLoading || noWeather) && styles.btnDisabled]}
            onPress={handleActivity}
            disabled={actLoading || noWeather}
          >
            {actLoading ? (
              <ActivityIndicator color={COLORS.ink2} size="small" />
            ) : (
              <Text style={styles.ghostBtnText}>
                {activity ? t('home.activityAnother') : t('home.activityCta')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 음식 추천 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardIcon}>🍵</Text>
            <Text style={styles.cardLabel}>{t('home.foodLabel')}</Text>
          </View>
          {food && (
            <Text style={styles.cardText}>{food.text}</Text>
          )}
          <TouchableOpacity
            style={[styles.ghostBtn, (foodLoading || noWeather) && styles.btnDisabled]}
            onPress={handleFood}
            disabled={foodLoading || noWeather}
          >
            {foodLoading ? (
              <ActivityIndicator color={COLORS.ink2} size="small" />
            ) : (
              <Text style={styles.ghostBtnText}>
                {food ? t('home.foodAnother') : t('home.foodCta')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 네이티브 광고 (피드 중간) */}
        <NativeAdCard />

        {/* 오늘의 운세 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardIcon}>🔮</Text>
            <Text style={styles.cardLabel}>{t('messaging.fortune')}</Text>
          </View>
          {fortune && (
            <Text style={styles.cardText}>{fortune.text}</Text>
          )}
          <TouchableOpacity
            style={[styles.ghostBtn, (fortLoading || noWeather) && styles.btnDisabled]}
            onPress={handleFortune}
            disabled={fortLoading || noWeather}
          >
            {fortLoading ? (
              <ActivityIndicator color={COLORS.ink2} size="small" />
            ) : (
              <Text style={styles.ghostBtnText}>
                {fortune ? t('messaging.fortuneAnother') : t('messaging.fortuneCta')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {noWeather && (
          <Text style={styles.noWeather}>{t('home.weatherLoading')}</Text>
        )}
      </ScrollView>

      {/* 메시지 톤 선택 모달 */}
      <Modal
        animationType="fade"
        transparent
        visible={pickerOpen}
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetGrip} />
            <Text style={styles.modalTitle}>{t('home.tonePickTitle')}</Text>
            <Text style={styles.modalSubtitle}>{t('home.tonePickSubtitle')}</Text>
            <View style={styles.modalOptions}>
              {PREF_ORDER.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={styles.optionRow}
                  onPress={() => handlePickPreference(key)}
                >
                  <View style={styles.optionIco}>
                    <Text style={styles.optionEmoji}>{PREFERENCE_EMOJI[key]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{prefLabel(key)}</Text>
                    <Text style={styles.optionDesc}>{t(PREF_DESC_KEY[key])}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setPickerOpen(false)}>
              <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <AppBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  container: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 80 },
  title: {
    fontFamily: FONTS.serifKo,
    fontSize: 24,
    color: COLORS.ink,
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    gap: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { fontSize: 22 },
  cardLabel: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.ink3,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardText: {
    fontFamily: FONTS.serifKo,
    fontSize: 16,
    lineHeight: 28,
    color: COLORS.ink,
    letterSpacing: -0.1,
  },
  btn: {
    backgroundColor: COLORS.ember,
    borderRadius: RADII.btn,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: COLORS.emberText, fontSize: 14.5, fontWeight: '600' },
  ghostBtn: {
    borderRadius: RADII.btn,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  ghostBtnText: { color: COLORS.ink2, fontSize: 14, fontWeight: '500' },
  btnDisabled: { opacity: 0.5 },
  noWeather: {
    textAlign: 'center',
    color: COLORS.ink3,
    fontSize: 13,
    marginTop: 12,
  },
  // 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(28,22,30,0.42)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: RADII.sheet,
    borderTopRightRadius: RADII.sheet,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 34,
  },
  sheetGrip: {
    width: 38, height: 4, borderRadius: 4,
    backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontFamily: FONTS.serifKo, color: COLORS.ink, fontSize: 21, textAlign: 'center' },
  modalSubtitle: { color: COLORS.ink3, fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 22 },
  modalOptions: { gap: 11 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 17,
    borderRadius: RADII.card, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.line, gap: 15,
  },
  optionIco: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: COLORS.paper3, alignItems: 'center', justifyContent: 'center',
  },
  optionEmoji: { fontSize: 20 },
  optionTitle: { fontFamily: FONTS.serifKoBold, color: COLORS.ink, fontSize: 16 },
  optionDesc: { color: COLORS.ink3, fontSize: 12.5, marginTop: 3, lineHeight: 18 },
  modalCancel: { marginTop: 16, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { color: COLORS.ink3, fontSize: 14 },
});
