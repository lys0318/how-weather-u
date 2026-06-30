import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  WeatherInfo,
  computeUmbrella,
  laundryIndex,
  maskIndex,
} from '../constants/weather';
import { COLORS, FONTS, RADII } from '../constants/theme';

const LEVEL_COLORS = [COLORS.ember, '#F59E0B', '#EF4444'];

interface Props {
  weather: WeatherInfo;
  currentHour: number;
}

export default function LifeIndex({ weather, currentHour }: Props) {
  const laundry = laundryIndex(weather);
  const umbrella = computeUmbrella(weather, currentHour);
  const mask = maskIndex(weather);

  const umbrellaPct = Math.round(umbrella.pop * 100);
  const umbrellaDesc = umbrella.raining
    ? '지금 비 와요'
    : !umbrella.needed
      ? '우산 불필요'
      : umbrella.hoursUntil && umbrella.hoursUntil >= 1
        ? umbrellaPct > 0
          ? `${umbrella.hoursUntil}시간 뒤 비 ${umbrellaPct}%`
          : `${umbrella.hoursUntil}시간 뒤 비`
        : '곧 비 소식';

  const cards = [
    { icon: '👕', label: '빨래', desc: laundry.ko, level: laundry.level },
    { icon: '☂️', label: '우산', desc: umbrellaDesc, level: umbrella.needed ? 2 : 0 },
    { icon: '😷', label: '마스크', desc: mask.ko, level: mask.level },
  ];

  return (
    <View style={styles.row}>
      {cards.map((c, i) => (
        <View key={i} style={[styles.card, { borderColor: LEVEL_COLORS[c.level] + '66' }]}>
          <Text style={styles.icon}>{c.icon}</Text>
          <Text style={styles.label}>{c.label}</Text>
          <Text style={[styles.desc, { color: LEVEL_COLORS[c.level] }]} numberOfLines={3}>
            {c.desc}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  card: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: RADII.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    gap: 4,
  },
  icon: { fontSize: 24 },
  label: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.ink2 },
  desc: { fontSize: 11.5, lineHeight: 15, textAlign: 'center' },
});
