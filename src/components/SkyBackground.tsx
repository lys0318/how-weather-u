// 날씨 + 시간대에 반응하는 "수채 하늘" 배경 (Sky Letter)
// - 6가지 팔레트(노을/맑음/흐림/비/맑은밤/흐린밤) 부드러운 세로 그라디언트
// - 날씨 장식: 해 글로우 / 구름 / 별+초승달 / 구름에 가린 달
// - 아래쪽은 날씨별로 살짝 물든 크림 페이퍼로 녹아들도록(melt) 처리
import React from 'react';
import { View, Text, Image, StyleSheet, ImageStyle, DimensionValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WeatherCondition } from '../constants/weather';

const GLOW_SRC = require('../../assets/textures/glow.png');

export type SkyKind = 'dusk' | 'day' | 'cloudy' | 'rain' | 'night' | 'cloudyNight';

const SKY: Record<SkyKind, readonly [string, string, string, string]> = {
  dusk: ['#5b5f93', '#8d6f9c', '#c98a82', '#e6b482'],
  day: ['#5e8bbd', '#8fb0cf', '#c9d3cf', '#e7ddc4'],
  cloudy: ['#6f7682', '#8d93a0', '#b3b5b8', '#d4cdbf'],
  rain: ['#4f6163', '#647577', '#8a9794', '#b4b6a8'],
  night: ['#232a44', '#384060', '#565f7e', '#8f8f8e'],
  cloudyNight: ['#262a3c', '#363b50', '#4d5165', '#7e7f88'],
};

// 본문 페이퍼를 날씨에 맞춰 아주 살짝 물들인 색 (melt 종착색 + 화면 배경)
const SKY_PAPER: Record<SkyKind, string> = {
  dusk: '#F4EBDD',
  day: '#F2EDE1',
  cloudy: '#ECEBE4',
  rain: '#E8EAE6',
  night: '#E7E5DD',
  cloudyNight: '#E6E4DC',
};

// 해 글로우 (맑은 낮/저녁만)
const SUN_GLOW: Record<'day' | 'dusk', ImageStyle> = {
  dusk: { width: 210, height: 210, top: 80, right: -34, opacity: 0.85, tintColor: '#f3c98e' },
  day: { width: 180, height: 180, top: 56, left: -30, opacity: 0.8, tintColor: '#f4ead0' },
};

export function getPaperTint(kind: SkyKind): string {
  return SKY_PAPER[kind];
}

// 날씨/시간 → 하늘 팔레트 매핑
export function getSkyKind(condition: WeatherCondition | null, hour: number): SkyKind {
  const isNight = hour < 5 || hour >= 20;
  const cloudy = condition === 'clouds' || condition === 'mist';
  if (condition === 'rain' || condition === 'drizzle' || condition === 'thunderstorm') return 'rain';
  if (isNight) return cloudy ? 'cloudyNight' : 'night'; // 흐린 밤 / 맑은 밤
  if (cloudy) return 'cloudy'; // 흐린 낮
  if (hour >= 17) return 'dusk'; // 맑은 저녁 노을
  return 'day'; // 맑은 낮
}

// ── 구름 한 덩이 (부드러운 퍼프 3개 겹침) ───────────────────
function Cloud({ top, left, right, w, color, opacity }: {
  top: number; left?: number; right?: number; w: number; color: string; opacity: number;
}) {
  const h = w * 0.6;
  const xPos = right !== undefined ? { right } : { left: left ?? 0 };
  return (
    <View style={[{ position: 'absolute', top, width: w, height: h }, xPos]} pointerEvents="none">
      <Image source={GLOW_SRC} resizeMode="stretch"
        style={{ position: 'absolute', left: 0, top: h * 0.22, width: w * 0.6, height: h * 0.7, opacity, tintColor: color }} />
      <Image source={GLOW_SRC} resizeMode="stretch"
        style={{ position: 'absolute', left: w * 0.26, top: 0, width: w * 0.6, height: h, opacity, tintColor: color }} />
      <Image source={GLOW_SRC} resizeMode="stretch"
        style={{ position: 'absolute', left: w * 0.5, top: h * 0.24, width: w * 0.56, height: h * 0.68, opacity, tintColor: color }} />
    </View>
  );
}

function Clouds({ variant }: { variant: 'cloudy' | 'rain' }) {
  const c = variant === 'rain' ? { color: '#9aa2a0', op: 0.5 } : { color: '#f2f1ea', op: 0.55 };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Cloud top={56} left={-36} w={250} color={c.color} opacity={c.op} />
      <Cloud top={150} left={168} w={210} color={c.color} opacity={c.op * 0.92} />
      <Cloud top={104} left={104} w={150} color={c.color} opacity={c.op * 0.8} />
    </View>
  );
}

// ── 별 (맑은 밤) ─────────────────────────────────────────────
const STARS: { x: DimensionValue; y: number; s: number; o: number }[] = [
  { x: '10%', y: 34, s: 2.6, o: 0.9 }, { x: '18%', y: 82, s: 1.6, o: 0.6 },
  { x: '27%', y: 48, s: 2, o: 0.8 }, { x: '35%', y: 106, s: 1.4, o: 0.55 },
  { x: '44%', y: 62, s: 2.6, o: 0.95 }, { x: '52%', y: 122, s: 1.6, o: 0.6 },
  { x: '60%', y: 42, s: 1.8, o: 0.7 }, { x: '15%', y: 150, s: 1.5, o: 0.5 },
  { x: '39%', y: 162, s: 2, o: 0.7 }, { x: '8%', y: 112, s: 1.8, o: 0.7 },
  { x: '49%', y: 202, s: 1.6, o: 0.5 }, { x: '29%', y: 200, s: 1.4, o: 0.45 },
  { x: '57%', y: 174, s: 2.2, o: 0.8 }, { x: '23%', y: 132, s: 1.3, o: 0.5 },
];

function Stars() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {STARS.map((st, i) => (
        <View key={i} style={{
          position: 'absolute', left: st.x, top: st.y,
          width: st.s, height: st.s, borderRadius: st.s / 2,
          backgroundColor: '#ffffff', opacity: st.o,
        }} />
      ))}
    </View>
  );
}

function Decor({ kind }: { kind: SkyKind }) {
  if (kind === 'day' || kind === 'dusk') {
    return <Image source={GLOW_SRC} resizeMode="stretch" style={[styles.sun, SUN_GLOW[kind]]} />;
  }
  if (kind === 'night') {
    // 맑은 밤 — 별 + 노란 초승달
    return (
      <>
        <Stars />
        <Image source={GLOW_SRC} resizeMode="stretch"
          style={{ position: 'absolute', width: 170, height: 170, top: 4, right: -2, opacity: 0.45, tintColor: '#ffe6a8' }} />
        <Text style={styles.crescent}>🌙</Text>
      </>
    );
  }
  if (kind === 'cloudyNight') {
    // 흐린 밤 — 은은한 달을 구름이 앞에서 가림 (달 → 구름 순서로 그려 가려지게)
    return (
      <>
        <Image source={GLOW_SRC} resizeMode="stretch"
          style={{ position: 'absolute', width: 150, height: 150, top: 6, right: 8, opacity: 0.4, tintColor: '#e9e2c4' }} />
        <View style={styles.dimMoon} />
        <Cloud top={92} right={-18} w={244} color="#3b4056" opacity={0.8} />
        <Cloud top={150} left={20} w={200} color="#3b4056" opacity={0.66} />
        <Cloud top={56} left={-46} w={178} color="#3b4056" opacity={0.6} />
      </>
    );
  }
  // cloudy / rain
  return <Clouds variant={kind === 'rain' ? 'rain' : 'cloudy'} />;
}

export default function SkyBackground({ kind }: { kind: SkyKind }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={SKY[kind]}
        locations={[0, 0.42, 0.72, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Decor kind={kind} />
      {/* 하단을 날씨별 페이퍼로 부드럽게 녹임 */}
      <LinearGradient colors={['rgba(243,236,223,0)', SKY_PAPER[kind]]} style={styles.melt} />
    </View>
  );
}

const styles = StyleSheet.create({
  sun: { position: 'absolute' },
  crescent: { position: 'absolute', top: 46, right: 52, fontSize: 64 },
  dimMoon: {
    position: 'absolute', top: 50, right: 66, width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#e7ddbb',
  },
  melt: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%' },
});
