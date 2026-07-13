import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  WeatherInfo,
  computeUmbrella,
  laundryIndex,
  maskIndex,
} from '../constants/weather';
import { COLORS, FONTS, RADII } from '../constants/theme';
import { useI18n } from '../i18n';

const LEVEL_COLORS = [COLORS.ember, '#F59E0B', '#EF4444'];

// reason 키 → i18n 키 (life.lRainSnow / life.mMust ...)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Props {
  weather: WeatherInfo;
  currentHour: number;
}

export default function LifeIndex({ weather, currentHour }: Props) {
  const { t } = useI18n();
  const laundry = laundryIndex(weather);
  const umbrella = computeUmbrella(weather, currentHour);
  const mask = maskIndex(weather);

  const umbrellaPct = Math.round(umbrella.pop * 100);
  const umbrellaDesc = umbrella.raining
    ? t('life.uNow')
    : !umbrella.needed
      ? t('life.uNo')
      : umbrella.hoursUntil && umbrella.hoursUntil >= 1
        ? umbrellaPct > 0
          ? t('life.uHpct', { hours: umbrella.hoursUntil, pct: umbrellaPct })
          : t('life.uH', { hours: umbrella.hoursUntil })
        : t('life.uSoon');

  const cards = [
    { icon: '👕', label: t('life.laundry'), desc: t(`life.l${cap(laundry.reason)}`), level: laundry.level },
    { icon: '☂️', label: t('life.umbrella'), desc: umbrellaDesc, level: umbrella.needed ? 2 : 0 },
    { icon: '😷', label: t('life.mask'), desc: t(`life.m${cap(mask.reason)}`), level: mask.level },
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
