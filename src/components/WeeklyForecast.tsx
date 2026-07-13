import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DailySlot, CONDITION_META, DAY_OF_WEEK_KO, DAY_OF_WEEK_EN_SHORT } from '../constants/weather';
import { COLORS, FONTS } from '../constants/theme';
import { useI18n } from '../i18n';

interface Props {
  days: DailySlot[];
}

export default function WeeklyForecast({ days }: Props) {
  const { t, lang } = useI18n();
  return (
    <View style={styles.wrap}>
      {days.map((d, i) => (
        <View key={i} style={styles.row}>
          <Text style={[styles.day, i === 0 && styles.today]}>
            {i === 0
              ? t('forecast.today')
              : lang === 'en'
                ? DAY_OF_WEEK_EN_SHORT[d.weekdayIdx]
                : DAY_OF_WEEK_KO[d.weekdayIdx]}
          </Text>
          <Text style={styles.icon}>{CONDITION_META[d.condition].emoji}</Text>
          {d.pop > 0.1 ? (
            <Text style={styles.pop}>{Math.round(d.pop * 100)}%</Text>
          ) : (
            <Text style={styles.popEmpty} />
          )}
          <View style={styles.temps}>
            <Text style={styles.min}>{d.tempMin}°</Text>
            <Text style={styles.sep}> / </Text>
            <Text style={styles.max}>{d.tempMax}°</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
  },
  day: { fontFamily: FONTS.mono, fontSize: 14, color: COLORS.ink, width: 50 },
  today: { color: COLORS.ember, fontWeight: '600' },
  icon: { fontSize: 22, width: 32, textAlign: 'center' },
  pop: { fontFamily: FONTS.mono, fontSize: 12, color: '#60A5FA', width: 38 },
  popEmpty: { width: 38 },
  temps: { flexDirection: 'row', marginLeft: 'auto' },
  min: { fontFamily: FONTS.mono, fontSize: 14, color: COLORS.ink3 },
  sep: { fontFamily: FONTS.mono, color: COLORS.ink3 },
  max: { fontFamily: FONTS.mono, fontSize: 14, color: COLORS.ink, fontWeight: '600' },
});
