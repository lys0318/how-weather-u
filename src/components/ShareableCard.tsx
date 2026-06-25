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

// 따뜻한 하늘 — 잉크가 자연스럽게 녹아들도록 톤이 고른 깊은 노을 계열
const CLEAR: [string, string, string, string] = ['#C2683F', '#AE5A36', '#9A4E2E', '#854327'];
const CLOUDY: [string, string, string, string] = ['#8C8071', '#7C7062', '#6C6153', '#5C5346'];
const RAIN: [string, string, string, string] = ['#6F6A60', '#615C53', '#534E46', '#46413A'];

// 잉크 (배경 위 글씨) — 따뜻한 아이보리
const IVORY = '#FCF5E9';
const IVORY2 = 'rgba(252,245,233,0.82)';
const IVORY3 = 'rgba(252,245,233,0.60)';
const HAIRLINE = 'rgba(252,245,233,0.26)';

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
    top: 70,
    right: -150,
    opacity: 0.5,
    tintColor: '#FBE4BE',
  },

  // 상단
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  date: { fontFamily: FONTS.serifKo, color: IVORY, fontSize: 42, fontWeight: '700' },
  condition: {
    fontFamily: FONTS.mono,
    color: IVORY3,
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
    color: IVORY2,
    fontSize: 25,
    letterSpacing: 1.5,
    marginBottom: 34,
  },
  message: {
    fontFamily: FONTS.serifKo,
    color: IVORY,
    fontSize: 60,
    lineHeight: 92,
    letterSpacing: -0.4,
    textShadowColor: 'rgba(38,22,12,0.22)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 16,
  },

  // 하단
  hairline: { height: 1, backgroundColor: HAIRLINE, marginBottom: 34 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  brand: { fontFamily: FONTS.serifKo, color: IVORY, fontSize: 36, fontWeight: '700', letterSpacing: 2 },
  brandEn: {
    fontFamily: FONTS.mono,
    color: IVORY3,
    fontSize: 17,
    marginTop: 9,
    letterSpacing: 3,
  },
  downloadCallout: { alignItems: 'flex-end' },
  downloadHint: { fontFamily: FONTS.mono, color: IVORY3, fontSize: 16, marginBottom: 6 },
  downloadCta: { color: IVORY, fontSize: 23, fontWeight: '700', letterSpacing: 0.5 },
});
