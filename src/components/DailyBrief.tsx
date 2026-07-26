import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WeatherInfo } from '../constants/weather';
import { buildCasterBrief } from '../services/brief';
import { COLORS, FONTS, RADII } from '../constants/theme';
import { useI18n } from '../i18n';

// 비 소식만 강조색, 나머지는 본문 톤 (전부 강조하면 아무것도 강조되지 않음)
const LINE_COLOR = {
  temp: COLORS.ink,
  sky: COLORS.ink,
  rain: COLORS.emberD,
  air: COLORS.ink2,
  closing: COLORS.ink2,
} as const;

interface Props {
  weather: WeatherInfo;
  currentHour: number;
}

export default function DailyBrief({ weather, currentHour }: Props) {
  const { t, lang } = useI18n();
  // lang이 바뀌면 문구도 다시 만들어야 함 (buildDailySummary는 전역 언어를 참조)
  const lines = useMemo(
    () => buildCasterBrief(weather, currentHour),
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
            i === 0 ? styles.lead : styles.sub,
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
    paddingVertical: 15,
    paddingHorizontal: 16,
    gap: 7,
  },
  title: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 0.4,
    color: COLORS.ink3,
    marginBottom: 2,
  },
  // 문장형이라 세리프가 더 어울림. 줄간격은 넉넉하게.
  lead: { fontFamily: FONTS.serifKo, fontSize: 14.5, lineHeight: 23 },
  sub: { fontFamily: FONTS.serifKo, fontSize: 13.5, lineHeight: 21 },
});
