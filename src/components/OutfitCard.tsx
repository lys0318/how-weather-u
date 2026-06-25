import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { WeatherInfo, outfitFor } from '../constants/weather';
import { COLORS, FONTS, RADII } from '../constants/theme';
import { useI18n } from '../i18n';

interface Props {
  weather: WeatherInfo;
  currentHour: number;
}

type Period = 'morning' | 'noon' | 'evening';
const PERIODS: { key: Period; targetHour: number }[] = [
  { key: 'morning', targetHour: 8 },
  { key: 'noon', targetHour: 14 },
  { key: 'evening', targetHour: 20 },
];

function defaultPeriod(hour: number): Period {
  if (hour < 11) return 'morning';
  if (hour < 17) return 'noon';
  return 'evening';
}

/** 해당 시간대 대표 기온 — hourly에서 목표시각 슬롯, 없으면 min/max로 폴백 */
function periodTemp(weather: WeatherInfo, target: number): number {
  const slot = weather.hourly?.find((s) => s.hour === target);
  if (slot) return slot.temp;
  if (target <= 9) return weather.tempMin;
  if (target >= 18) return Math.round((weather.tempMin + weather.tempMax) / 2);
  return weather.tempMax;
}

export default function OutfitCard({ weather, currentHour }: Props) {
  const { t, lang } = useI18n();
  const [period, setPeriod] = useState<Period>(defaultPeriod(currentHour));

  const target = PERIODS.find((p) => p.key === period)!.targetHour;
  const temp = periodTemp(weather, target);
  const outfit = outfitFor(temp);
  const o = lang === 'en' ? outfit.en : outfit.ko;

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.headIcon}>🧺</Text>
        <Text style={styles.headTitle}>{t('outfit.title')}</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.temp}>{temp}°</Text>
      </View>

      <View style={styles.toggle}>
        {PERIODS.map((p) => {
          const active = p.key === period;
          return (
            <TouchableOpacity
              key={p.key}
              style={[styles.pill, active && styles.pillActive]}
              onPress={() => setPeriod(p.key)}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {t(`outfit.${p.key}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.main}>
        <Text style={styles.bigEmoji}>{outfit.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{o.name}</Text>
          <Text style={styles.desc}>{o.desc}</Text>
        </View>
      </View>

      <View style={styles.chips}>
        {o.items.map((item, i) => (
          <View key={i} style={styles.chip}>
            <Text style={styles.chipText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 2 },
  headIcon: { fontSize: 16 },
  headTitle: { fontFamily: FONTS.serifKoBold, fontSize: 15, color: COLORS.ink },
  temp: { fontFamily: FONTS.monoMedium, fontSize: 17, color: COLORS.ember },

  toggle: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  pill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: COLORS.paper2,
  },
  pillActive: { backgroundColor: COLORS.ember },
  pillText: { fontFamily: FONTS.mono, fontSize: 12.5, color: COLORS.ink3 },
  pillTextActive: { color: COLORS.emberText, fontWeight: '600' },

  main: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14, paddingHorizontal: 2 },
  bigEmoji: { fontSize: 42 },
  name: { fontFamily: FONTS.serifKoBold, fontSize: 20, color: COLORS.ink },
  desc: { fontFamily: FONTS.serifKo, fontSize: 13.5, color: COLORS.ink2, marginTop: 3, lineHeight: 19 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: COLORS.emberSoft,
    borderWidth: 1,
    borderColor: 'rgba(194,104,63,0.18)',
  },
  chipText: { fontFamily: FONTS.mono, fontSize: 12.5, color: COLORS.emberD },
});
