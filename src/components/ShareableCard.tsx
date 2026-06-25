// SNS 공유용 정사각형 카드 (1080x1080) — Sky Letter
// 흰 종이 없이, 메시지를 따뜻한 하늘 배경 위에 직접 얹어 바탕과 자연스럽게 어우러지게.

import React, { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WeatherCondition } from '../constants/weather';
import { translate } from '../i18n';
import { FONTS } from '../constants/theme';

interface Props {
  text: string;
  weatherEmoji: string;
  conditionKo?: string;
  dateLabel: string; // 예: "5월 23일 토요일 저녁"
  toneLabel?: string; // 예: "💖 위로 메시지"
  condition?: WeatherCondition;
}

const GLOW_SRC = require('../../assets/textures/glow.png');

// 따뜻한 하늘 — 연하고 은은한 크림/노을 계열 (앱 본연의 종이 톤)
const CLEAR: [string, string, string, string] = ['#F4DFC1', '#EDD2AB', '#E4C195', '#D8AE7D'];
const CLOUDY: [string, string, string, string] = ['#EDE6D8', '#E1D9C8', '#D4CAB7', '#C5BAA6'];
const RAIN: [string, string, string, string] = ['#E8E2D8', '#DCD5C9', '#CEC7B9', '#BEB6A6'];

// 잉크 (배경 위 글씨) — 진한 잉크 (연한 배경에 또렷·은은하게)
const INK = '#2B2620';
const INK2 = '#6B6253';
const INK3 = 'rgba(43,38,32,0.55)';
const HAIRLINE = 'rgba(43,38,32,0.14)';

function skyFor(condition?: WeatherCondition): [string, string, string, string] {
  if (condition === 'clouds' || condition === 'mist') return CLOUDY;
  if (condition === 'rain' || condition === 'drizzle' || condition === 'thunderstorm') return RAIN;
  return CLEAR; // clear / snow / 기본 → 따뜻한 노을
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
        locations={[0, 0.4, 0.72, 1]}
        start={{ x: 0.12, y: 0 }}
        end={{ x: 0.92, y: 1 }}
        style={styles.gradient}
      >
        {isClear && (
          <Image source={GLOW_SRC} resizeMode="stretch" style={styles.sun} />
        )}

        {/* 상단: 날짜 + 날씨 */}
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Text style={styles.date}>{dateLabel}</Text>
            {conditionKo ? <Text style={styles.condition}>{conditionKo}</Text> : null}
          </View>
          <Text style={styles.weatherEmoji}>{weatherEmoji}</Text>
        </View>

        {/* 중앙: 메시지 (바탕 위에 직접) */}
        <View style={styles.center}>
          {toneLabel ? <Text style={styles.tone}>✦  {toneLabel}</Text> : null}
          <Text style={styles.message} numberOfLines={10} adjustsFontSizeToFit minimumFontScale={0.6}>
            {text}
          </Text>
        </View>

        {/* 하단: 구분선 + 브랜드 + 다운로드 안내 */}
        <View>
          <View style={styles.hairline} />
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
  gradient: { flex: 1, paddingHorizontal: 92, paddingVertical: 96, justifyContent: 'space-between' },
  sun: {
    position: 'absolute',
    width: 540,
    height: 540,
    top: 60,
    right: -160,
    opacity: 0.42,
    tintColor: '#F6D9A8',
  },

  // 상단
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  date: { fontFamily: FONTS.serifKo, color: INK, fontSize: 42, fontWeight: '700' },
  condition: {
    fontFamily: FONTS.mono,
    color: INK3,
    fontSize: 21,
    marginTop: 12,
    letterSpacing: 6,
    textTransform: 'uppercase',
  },
  weatherEmoji: { fontSize: 92, marginTop: -6 },

  // 중앙 메시지
  center: { flex: 1, justifyContent: 'center', paddingVertical: 40 },
  tone: {
    fontFamily: FONTS.mono,
    color: INK2,
    fontSize: 25,
    letterSpacing: 1.5,
    marginBottom: 34,
  },
  message: {
    fontFamily: FONTS.serifKo,
    color: INK,
    fontSize: 60,
    lineHeight: 92,
    letterSpacing: -0.4,
  },

  // 하단
  hairline: { height: 1, backgroundColor: HAIRLINE, marginBottom: 34 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  brand: { fontFamily: FONTS.serifKo, color: INK, fontSize: 36, fontWeight: '700', letterSpacing: 2 },
  brandEn: {
    fontFamily: FONTS.mono,
    color: INK3,
    fontSize: 17,
    marginTop: 9,
    letterSpacing: 3,
  },
  downloadCallout: { alignItems: 'flex-end' },
  downloadHint: { fontFamily: FONTS.mono, color: INK3, fontSize: 16, marginBottom: 6 },
  downloadCta: { color: INK, fontSize: 23, fontWeight: '700', letterSpacing: 0.5 },
});
