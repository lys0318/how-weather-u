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
const DUSK: [string, string, string, string] = ['#6D7794', '#9D8DA3', '#D4A18E', '#F3D7B3'];
const CLOUDY: [string, string, string, string] = ['#78818C', '#A4A9AE', '#D0C8BB', '#F1E3CE'];
const RAIN: [string, string, string, string] = ['#52696E', '#77878A', '#AAB0AA', '#E0D5C0'];

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

        <View style={styles.envelopeShadow} />

        {/* 상단: 날씨 이모지 + 날짜 */}
        <View style={styles.top}>
          <View>
            <Text style={styles.date}>{dateLabel}</Text>
            {conditionKo ? <Text style={styles.condition}>{conditionKo}</Text> : null}
          </View>
          <View style={styles.postmark}>
            <Text style={styles.weatherEmoji}>{weatherEmoji}</Text>
          </View>
        </View>

        {/* 중앙: 편지 노트 */}
        <View style={styles.noteWrap}>
          <View style={styles.envelopeBack}>
            <View style={styles.envelopeFlap} />
          </View>
          <View style={styles.note}>
            <View style={styles.paperStripe} />
            {toneLabel ? (
              <View style={styles.toneRow}>
                <View style={styles.pip}><Text style={styles.pipText}>✦</Text></View>
                <Text style={styles.tone}>{toneLabel}</Text>
              </View>
            ) : null}
            <Text style={styles.message} numberOfLines={9} adjustsFontSizeToFit>
              {text}
            </Text>
            <View style={styles.signRow}>
              <Text style={styles.sign}>{translate('common.appName')}</Text>
              <Text style={styles.signDate}>SKY LETTER</Text>
            </View>
          </View>
          <View style={styles.envelopeFront}>
            <View style={styles.seal}>
              <Text style={styles.sealText}>{weatherEmoji}</Text>
            </View>
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
    top: -2000,
    left: 0,
    width: CARD,
    height: CARD,
    opacity: 1, // 캡처용 — 화면 밖에서 렌더링
    zIndex: -1,
  },
  gradient: { flex: 1, paddingHorizontal: 76, paddingVertical: 78, justifyContent: 'space-between' },
  sun: {
    position: 'absolute',
    width: 520,
    height: 520,
    top: 120,
    right: -120,
    opacity: 0.75,
    tintColor: '#f3c98e',
  },
  envelopeShadow: {
    position: 'absolute',
    left: 118,
    right: 118,
    top: 388,
    height: 390,
    borderRadius: 70,
    backgroundColor: 'rgba(43,38,32,0.12)',
    transform: [{ rotate: '-2deg' }],
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  postmark: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: 'rgba(251,247,239,0.88)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.70)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherEmoji: { fontSize: 58 },
  date: { fontFamily: FONTS.serifKo, color: '#ffffff', fontSize: 38, fontWeight: '700' },
  condition: {
    fontFamily: FONTS.mono,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 22,
    marginTop: 8,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  noteWrap: { flex: 1, justifyContent: 'center', paddingVertical: 18 },
  envelopeBack: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 58,
    height: 292,
    borderRadius: 54,
    backgroundColor: '#E6D8BF',
    borderWidth: 2,
    borderColor: 'rgba(43,38,32,0.10)',
    zIndex: 1,
  },
  envelopeFlap: {
    position: 'absolute',
    left: 172,
    top: -126,
    width: 420,
    height: 420,
    backgroundColor: '#F8F1E4',
    transform: [{ rotate: '45deg' }],
    borderWidth: 2,
    borderColor: 'rgba(43,38,32,0.07)',
  },
  note: {
    backgroundColor: '#FFFDF7',
    borderRadius: 34,
    paddingHorizontal: 66,
    paddingTop: 62,
    paddingBottom: 60,
    marginHorizontal: 46,
    marginBottom: 34,
    borderWidth: 1,
    borderColor: 'rgba(120,95,65,0.20)',
    shadowColor: '#2B2620',
    shadowOpacity: 0.22,
    shadowRadius: 46,
    shadowOffset: { width: 0, height: 28 },
    elevation: 5,
    zIndex: 3,
  },
  paperStripe: {
    position: 'absolute',
    top: 0,
    left: 56,
    right: 56,
    height: 9,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
    backgroundColor: 'rgba(194,104,63,0.12)',
  },
  toneRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.ember,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipText: { color: COLORS.emberText, fontSize: 18 },
  tone: { fontSize: 26, fontWeight: '600', letterSpacing: 1, color: COLORS.emberD },
  message: {
    fontFamily: FONTS.serifKo,
    color: COLORS.ink,
    fontSize: 48,
    lineHeight: 74,
    letterSpacing: -0.3,
    marginTop: 30,
  },
  signRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 42,
    paddingTop: 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(43,38,32,0.08)',
  },
  sign: { fontFamily: FONTS.serifKo, color: COLORS.ink2, fontSize: 30 },
  signDate: { fontFamily: FONTS.mono, color: COLORS.ink3, fontSize: 18, letterSpacing: 4 },
  envelopeFront: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 58,
    height: 142,
    borderBottomLeftRadius: 54,
    borderBottomRightRadius: 54,
    backgroundColor: 'rgba(227,215,194,0.90)',
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: 'rgba(43,38,32,0.09)',
    zIndex: 2,
  },
  seal: {
    position: 'absolute',
    alignSelf: 'center',
    top: -28,
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.ember,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,245,238,0.72)',
  },
  sealText: { fontSize: 32 },
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
