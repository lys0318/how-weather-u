import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { COLORS } from '../constants/theme';

export interface WeatherWidgetProps {
  emoji: string;
  temp: string; // 예 "24°"
  city: string;
  line: string;
}

export function WeatherWidget({ emoji, temp, city, line }: WeatherWidgetProps) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        backgroundColor: COLORS.paper,
        borderRadius: 20,
        padding: 14,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget text={`${emoji} ${temp}`} style={{ fontSize: 26, color: COLORS.ink, fontWeight: '700' }} />
        <TextWidget text={`  ${city}`} style={{ fontSize: 13, color: COLORS.ink2 }} />
      </FlexWidget>
      <TextWidget text={line} maxLines={2} style={{ fontSize: 14, color: COLORS.ink, marginTop: 6 }} />
    </FlexWidget>
  );
}
