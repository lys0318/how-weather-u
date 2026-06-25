import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { HourlySlot, CONDITION_META } from '../constants/weather';
import { COLORS, FONTS } from '../constants/theme';

interface Props {
  slots: HourlySlot[];
  currentHour: number;
}

export default function HourlyForecast({ slots, currentHour }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {slots.map((s, i) => {
        const isCurrent = s.hour === currentHour;
        return (
          <View key={i} style={[styles.cell, isCurrent && styles.current]}>
            <Text style={[styles.time, isCurrent && styles.timeActive]}>
              {isCurrent ? '지금' : `${s.hour}시`}
            </Text>
            <Text style={styles.icon}>{CONDITION_META[s.condition].emoji}</Text>
            <Text style={[styles.temp, isCurrent && styles.tempActive]}>{s.temp}°</Text>
            {s.pop > 0.1 && (
              <Text style={styles.pop}>{Math.round(s.pop * 100)}%</Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 4, paddingVertical: 4 },
  cell: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginHorizontal: 3,
    borderRadius: 14,
    minWidth: 52,
  },
  current: { backgroundColor: COLORS.ember + '26' },
  time: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.ink3 },
  timeActive: { color: COLORS.ember, fontWeight: '600' },
  icon: { fontSize: 22, marginVertical: 4 },
  temp: { fontFamily: FONTS.mono, fontSize: 14, color: COLORS.ink },
  tempActive: { color: COLORS.ember, fontWeight: '700' },
  pop: { fontFamily: FONTS.mono, fontSize: 11, color: '#60A5FA', marginTop: 2 },
});
