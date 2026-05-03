import React, { useEffect, useRef, useMemo } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import { WeatherCondition } from '../constants/weather';

const { width, height } = Dimensions.get('window');
const PARTICLE_COUNT = 40;

// ── 빗방울 ────────────────────────────────────────────────
function RainDrop({ index }: { index: number }) {
  const y = useRef(new Animated.Value(-30)).current;
  const x = useMemo(() => Math.random() * width, []);
  const duration = useMemo(() => 700 + Math.random() * 400, []);
  const delay = useMemo(() => Math.random() * 1500, []);
  const opacity = useMemo(() => 0.3 + Math.random() * 0.4, []);
  const dropHeight = useMemo(() => 18 + Math.random() * 12, []);

  useEffect(() => {
    const animate = () => {
      y.setValue(-30);
      Animated.timing(y, {
        toValue: height + 30,
        duration,
        delay: index === 0 ? delay : 0,
        useNativeDriver: true,
      }).start(() => animate());
    };
    const timer = setTimeout(animate, delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={[
        styles.raindrop,
        {
          left: x,
          height: dropHeight,
          opacity,
          transform: [{ translateY: y }, { rotate: '15deg' }],
        },
      ]}
    />
  );
}

// ── 눈송이 ────────────────────────────────────────────────
function Snowflake({ index }: { index: number }) {
  const y = useRef(new Animated.Value(-20)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const x = useMemo(() => Math.random() * width, []);
  const size = useMemo(() => 4 + Math.random() * 6, []);
  const duration = useMemo(() => 3000 + Math.random() * 2000, []);
  const delay = useMemo(() => Math.random() * 3000, []);
  const swayAmount = useMemo(() => 20 + Math.random() * 30, []);

  useEffect(() => {
    const animateFall = () => {
      y.setValue(-20);
      Animated.timing(y, {
        toValue: height + 20,
        duration,
        delay: index === 0 ? delay : 0,
        useNativeDriver: true,
      }).start(() => animateFall());
    };

    const animateSway = () => {
      Animated.sequence([
        Animated.timing(sway, { toValue: swayAmount, duration: duration / 2, useNativeDriver: true }),
        Animated.timing(sway, { toValue: -swayAmount, duration: duration / 2, useNativeDriver: true }),
      ]).start(() => animateSway());
    };

    const timer = setTimeout(() => {
      animateFall();
      animateSway();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={[
        styles.snowflake,
        {
          left: x,
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: 0.6 + Math.random() * 0.3,
          transform: [{ translateY: y }, { translateX: sway }],
        },
      ]}
    />
  );
}

// ── 안개 입자 ─────────────────────────────────────────────
function MistParticle({ index }: { index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const x = useMemo(() => Math.random() * width, []);
  const y = useMemo(() => Math.random() * height, []);
  const size = useMemo(() => 80 + Math.random() * 120, []);
  const delay = useMemo(() => Math.random() * 3000, []);

  useEffect(() => {
    const animate = () => {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.08 + Math.random() * 0.06, duration: 2000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ]).start(() => animate());
    };
    const timer = setTimeout(animate, delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={[
        styles.mist,
        { left: x - size / 2, top: y - size / 2, width: size, height: size, opacity },
      ]}
    />
  );
}

// ── 번개 플래시 ───────────────────────────────────────────
function LightningFlash() {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const flash = () => {
      const nextDelay = 3000 + Math.random() * 5000;
      setTimeout(() => {
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.3, duration: 50, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 100, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.2, duration: 50, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => flash());
      }, nextDelay);
    };
    flash();
  }, []);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: '#b8d4ff', opacity }]}
    />
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────
interface Props {
  condition: WeatherCondition;
}

export default function WeatherAnimation({ condition }: Props) {
  const particles = useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, (_, i) => i),
    []
  );

  if (condition === 'rain' || condition === 'drizzle') {
    const count = condition === 'drizzle' ? 20 : PARTICLE_COUNT;
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: count }, (_, i) => (
          <RainDrop key={i} index={i} />
        ))}
      </View>
    );
  }

  if (condition === 'thunderstorm') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 30 }, (_, i) => (
          <RainDrop key={i} index={i} />
        ))}
        <LightningFlash />
      </View>
    );
  }

  if (condition === 'snow') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {particles.map((i) => (
          <Snowflake key={i} index={i} />
        ))}
      </View>
    );
  }

  if (condition === 'mist') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 8 }, (_, i) => (
          <MistParticle key={i} index={i} />
        ))}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  raindrop: {
    position: 'absolute',
    width: 1.5,
    backgroundColor: '#a8c8e8',
    borderRadius: 1,
  },
  snowflake: {
    position: 'absolute',
    backgroundColor: '#ffffff',
  },
  mist: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderRadius: 999,
  },
});
