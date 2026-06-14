// 화면 전체에 얇게 깔리는 필름 그레인 — "사람이 만든" 손맛/리소그래프 질감
// 각 화면 root의 마지막 자식으로 두면 콘텐츠 위에 아주 옅게 덮인다.
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

export default function Grain({ opacity = 0.06 }: { opacity?: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={require('../../assets/textures/grain.png')}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, { opacity }]}
      />
    </View>
  );
}
