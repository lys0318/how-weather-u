// SNS 공유용 정사각형 카드 (1080x1080) — Sky Letter
// 노을(또는 날씨) 하늘 위에 크림 편지 노트. react-native-view-shot 으로 캡처.

import React, { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WeatherCondition } from '../constants/weather';
import { translate } from '../i18n';
import { COLORS, FONTS } from '../constants/theme';

interface Props {
  text: string;
  weatherEmoji: string;
  conditionKo?: string;
  dateLabel: string; // 예: "5월 23일 토요일 저녁"
  toneLabel?: string; // 예: "💖 위로 메시지"
  condition?: WeatherCondition;
}

const GLOW_SRC = require('../../assets/textures/glow.png');

// 날씨별 하늘 (앱 본문과 동일 계열 — 맑음/눈은 따뜻한 노을로)
const DUSK: [string, string, string, string] = ['#5b5f93', '#8d6f9c', '#c98a82', '#e6b482'];
const CLOUDY: [string, string, string, string] = ['#6f7682', '#8d93a0', '#b3b5b8', '#d4cdbf'];
const RAIN: [string, string, string, string] = ['#4f6163', '#647577', '#8a9794', '#b4b6a8'];

function skyFor(condition?: WeatherCondition): [string, string, string, string] {
  if (condition === 'clouds' || condition === 'mist') return CLOUDY;
  if (condition === 'rain' || condition === 'drizzle' || condition === 'thunderstorm') return RAIN;
  return DUSK; // clear / snow / 기본 → 노을
}

export const ShareableCard = forwardRef<View, Props>(function ShareableCard(
  { text, weatherEmoji, conditionKo, dateLabel, toneLabel, condition },
  ref,
) {
  const isClear = !(
    condition === 'clouds' || condition === 'mist' ||
    condition === 'rain' || condition === 'drizzle' || condition === 'thunderstorm'
  );
  return (
    <View ref={ref} collapsable={false} style={styles.cardWrap}>
      <LinearGradient
        colors={skyFor(condition)}
        locations={[0, 0.42, 0.72, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.gradient}
      >
        {isClear && (
          <Image source={GLOW_SRC} resizeMode="stretch" style={styles.sun} />
        )}

        {/* 상단: 날씨 이모지 + 날짜 */}
        <View style={styles.top}>
          <Text style={styles.weatherEmoji}>{weatherEmoji}</Text>
          <Text style={styles.date}>{dateLabel}</Text>
          {conditionKo ? <Text style={styles.condition}>{conditionKo}</Text> : null}
        </View>

        {/* 중앙: 편지 노트 */}
        <View style={styles.noteWrap}>
          <View style={styles.note}>
            {toneLabel ? (
              <View style={styles.toneRow}>
                <View style={styles.pip} />
                <Text style={styles.tone}>{toneLabel}</Text>
              </View>
            ) : null}
            <Text style={styles.quote}>“</Text>
            <Text style={styles.message} numberOfLines={9} adjustsFontSizeToFit>
              {text}
            </Text>
            <Text style={styles.sign}>— {translate('common.appName')}</Text>
          </View>
        </View>

        {/* 하단: 브랜드 + 다운로드 안내 */}
        <View style={styles.bottom}>
          <View>
            <Text style={styles.brand}>하우웨더유</Text>
            <Text style={styles.brandEn}>HOW WEATHER YOU</Text>
          </View>
          <View style={styles.downloadCallout}>
            <Text style={styles.downloadHint}>{translate('share.downloadHint')}</Text>
            <Text style={styles.downloadCta}>{translate('common.appName')} ⌄</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
});

const CARD = 1080;
const styles = StyleSheet.create({
  cardWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CARD,
    height: CARD,
    opacity: 0, // 캡처용 — 화면엔 안 보이지만 렌더링됨
    zIndex: -1,
  },
  gradient: { flex: 1, paddingHorizontal: 76, paddingVertical: 84, justifyContent: 'space-between' },
  sun: {
    position: 'absolute',
    width: 520,
    height: 520,
    top: 120,
    right: -120,
    opacity: 0.75,
    tintColor: '#f3c98e',
  },
  top: { alignItems: 'flex-start' },
  weatherEmoji: { fontSize: 96, marginBottom: 10 },
  date: { fontFamily: FONTS.serifKo, color: '#ffffff', fontSize: 36, fontWeight: '700' },
  condition: {
    fontFamily: FONTS.mono,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 22,
    marginTop: 8,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  noteWrap: { flex: 1, justifyContent: 'center', paddingVertical: 30 },
  note: {
    backgroundColor: COLORS.noteTop,
    borderRadius: 48,
    paddingHorizontal: 64,
    paddingTop: 56,
    paddingBottom: 52,
    borderWidth: 1,
    borderColor: COLORS.line,
    shadowColor: '#2B2620',
    shadowOpacity: 0.3,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 30 },
  },
  toneRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pip: { width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.ember },
  tone: { fontSize: 26, fontWeight: '600', letterSpacing: 1, color: COLORS.emberD },
  quote: { fontFamily: FONTS.serifEn, fontSize: 120, lineHeight: 90, color: COLORS.paper3, height: 64 },
  message: {
    fontFamily: FONTS.serifKo,
    color: COLORS.ink,
    fontSize: 54,
    lineHeight: 86,
    letterSpacing: -0.5,
  },
  sign: { fontFamily: FONTS.serifKo, fontStyle: 'italic', color: COLORS.ink3, fontSize: 30, marginTop: 36 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  brand: { fontFamily: FONTS.serifKo, color: '#ffffff', fontSize: 34, fontWeight: '700', letterSpacing: 2 },
  brandEn: {
    fontFamily: FONTS.mono,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 17,
    marginTop: 7,
    letterSpacing: 3,
  },
  downloadCallout: {
    alignItems: 'flex-end',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(251,247,239,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  downloadHint: { fontFamily: FONTS.mono, color: COLORS.ink3, fontSize: 15, marginBottom: 3 },
  downloadCta: { color: COLORS.emberD, fontSize: 22, fontWeight: '700', letterSpacing: 1 },
});
