// SNS 공유용 정사각형 카드 (1080x1080)
// react-native-view-shot 으로 캡처해서 expo-sharing 으로 공유

import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WeatherCondition } from '../constants/weather';
import { translate } from '../i18n';

interface Props {
  text: string;
  weatherEmoji: string;
  conditionKo?: string;
  dateLabel: string; // 예: "5월 23일 토요일 저녁"
  toneLabel?: string; // 예: "💖 위로 메시지"
  condition?: WeatherCondition;
}

// 카드 그라디언트 (날씨/시간 무관하게 브랜드 톤으로 통일 — SNS에서 일관된 느낌)
const BRAND_GRADIENT: [string, string, string, string] = [
  '#0a1228',
  '#1a2350',
  '#5a3870',
  '#c36c80',
];

export const ShareableCard = forwardRef<View, Props>(function ShareableCard(
  { text, weatherEmoji, conditionKo, dateLabel, toneLabel },
  ref,
) {
  return (
    <View ref={ref} collapsable={false} style={styles.cardWrap}>
      <LinearGradient colors={BRAND_GRADIENT} style={styles.gradient}>
        {/* 상단: 날씨 이모지 + 날짜 */}
        <View style={styles.top}>
          <Text style={styles.weatherEmoji}>{weatherEmoji}</Text>
          <Text style={styles.date}>{dateLabel}</Text>
          {conditionKo ? <Text style={styles.condition}>{conditionKo}</Text> : null}
        </View>

        {/* 중앙: 메시지 */}
        <View style={styles.center}>
          {toneLabel ? <Text style={styles.tone}>{toneLabel}</Text> : null}
          <Text style={styles.message} numberOfLines={10} adjustsFontSizeToFit>
            {text}
          </Text>
        </View>

        {/* 하단: 앱 브랜드 + 다운로드 안내 */}
        <View style={styles.bottom}>
          <View>
            <Text style={styles.brand}>하우웨더유</Text>
            <Text style={styles.brandEn}>How Weather You</Text>
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

const CARD_SIZE = 1080;
const styles = StyleSheet.create({
  // 캡처용 — 화면 위치는 0,0에 두고 opacity로 안 보이게
  // (off-screen 위치는 일부 Android 버전에서 렌더링 안 돼 캡처 실패함)
  cardWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CARD_SIZE,
    height: CARD_SIZE,
    opacity: 0, // 사용자에겐 안 보이지만 React Native는 렌더링함
    zIndex: -1,
  },
  gradient: {
    flex: 1,
    paddingHorizontal: 80,
    paddingVertical: 90,
    justifyContent: 'space-between',
  },
  top: {
    alignItems: 'flex-start',
  },
  weatherEmoji: {
    fontSize: 100,
    marginBottom: 12,
  },
  date: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 30,
    fontWeight: '600',
  },
  condition: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 22,
    marginTop: 4,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  tone: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 22,
    letterSpacing: 1.5,
    marginBottom: 22,
  },
  message: {
    color: '#ffffff',
    fontSize: 56,
    fontWeight: '300',
    lineHeight: 80,
    letterSpacing: -0.5,
  },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  brand: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 22,
    fontWeight: '500',
    letterSpacing: 3,
  },
  brandEn: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    marginTop: 4,
    letterSpacing: 2,
  },
  downloadCallout: {
    alignItems: 'flex-end',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  downloadHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    marginBottom: 2,
  },
  downloadCta: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1,
  },
});
