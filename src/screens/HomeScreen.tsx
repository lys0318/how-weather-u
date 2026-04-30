import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useWeather } from '../hooks/useWeather';
import { getTimeOfDay, TIME_OF_DAY_KO, DAY_OF_WEEK_KO } from '../constants/weather';

export default function HomeScreen() {
  const { weather, loading, error, refetch } = useWeather();
  const now = new Date();
  const timeOfDay = TIME_OF_DAY_KO[getTimeOfDay(now.getHours())];
  const dayOfWeek = DAY_OF_WEEK_KO[now.getDay()];

  return (
    <View style={styles.container}>
      <Text style={styles.context}>
        {dayOfWeek} {timeOfDay}
      </Text>

      {loading && <ActivityIndicator color="#ffffff" style={{ marginTop: 24 }} />}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={refetch} style={styles.retryButton}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      )}

      {weather && !loading && (
        <View style={styles.weatherCard}>
          <Text style={styles.emoji}>{weather.emoji}</Text>
          <Text style={styles.condition}>{weather.conditionKo}</Text>
          <Text style={styles.temp}>{weather.temp}°C</Text>
          <Text style={styles.city}>{weather.city}</Text>
        </View>
      )}

      <Text style={styles.title}>하우웨더유</Text>
      <Text style={styles.subtitle}>How Weather You</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f0f0f',
    padding: 24,
  },
  context: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  weatherCard: {
    alignItems: 'center',
    marginVertical: 24,
    padding: 24,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    width: '100%',
  },
  emoji: {
    fontSize: 56,
    marginBottom: 8,
  },
  condition: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
  temp: {
    color: '#aaaaaa',
    fontSize: 16,
    marginTop: 4,
  },
  city: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    marginTop: 6,
  },
  errorBox: {
    alignItems: 'center',
    marginVertical: 24,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 14,
  },
});
