import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import {
  WeatherInfo,
  sportsIndex,
  SPORT_KEYS,
  SPORT_EMOJI,
} from '../constants/weather';
import { COLORS, FONTS, RADII } from '../constants/theme';
import { useI18n } from '../i18n';

// 레벨별 색: 0 좋음(차분한 청록) / 1 보통(주황) / 2 나쁨(빨강)
const LEVEL_COLORS = [COLORS.teal, '#F59E0B', '#EF4444'];

interface Props {
  weather: WeatherInfo;
}

export default function SportsIndex({ weather }: Props) {
  const { t } = useI18n();
  const scores = sportsIndex(weather);

  return (
    <View>
      <Text style={styles.title}>{t('sports.title')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {SPORT_KEYS.map((k) => {
          const { level, reason } = scores[k];
          const color = LEVEL_COLORS[level];
          return (
            <View key={k} style={[styles.card, { borderColor: color + '66' }]}>
              <Text style={styles.icon}>{SPORT_EMOJI[k]}</Text>
              <Text style={styles.label}>{t(`sports.${k}`)}</Text>
              <Text style={[styles.desc, { color }]} numberOfLines={2}>
                {t(`sports.${reason}`)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.ink2, marginBottom: 8 },
  row: { gap: 8, paddingRight: 4 },
  card: {
    width: 78,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: RADII.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    gap: 4,
  },
  icon: { fontSize: 24 },
  label: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.ink2 },
  desc: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
});
