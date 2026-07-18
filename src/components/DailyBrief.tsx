import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WeatherInfo } from '../constants/weather';
import { buildDailySummary } from '../services/brief';
import { COLORS, FONTS, RADII } from '../constants/theme';
import { useI18n } from '../i18n';

const LINE_COLOR = {
  temp: COLORS.ink,
  rain: COLORS.emberD,
  alert: COLORS.ink2,
} as const;

interface Props {
  weather: WeatherInfo;
  currentHour: number;
}

export default function DailyBrief({ weather, currentHour }: Props) {
  const { t, lang } = useI18n();
  // lang이 바뀌면 문구도 다시 만들어야 함 (buildDailySummary는 전역 언어를 참조)
  const lines = useMemo(
    () => buildDailySummary(weather, currentHour),
    [weather, currentHour, lang],
  );

  if (lines.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('brief.title')}</Text>
      {lines.map((l, i) => (
        <Text
          key={i}
          style={[
            l.kind === 'temp' ? styles.lead : styles.sub,
            { color: LINE_COLOR[l.kind] },
          ]}
        >
          {l.text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 5,
  },
  title: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 0.4,
    color: COLORS.ink3,
    marginBottom: 2,
  },
  lead: { fontFamily: FONTS.monoMedium, fontSize: 14.5, lineHeight: 21 },
  sub: { fontSize: 13, lineHeight: 19 },
});
