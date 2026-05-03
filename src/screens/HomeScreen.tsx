import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Share,
} from 'react-native';
import { useWeather } from '../hooks/useWeather';
import { useMessage } from '../hooks/useMessage';
import { getTimeOfDay, TIME_OF_DAY_KO, DAY_OF_WEEK_KO } from '../constants/weather';
import { getPreference, saveMessage } from '../utils/storage';
import { Preference } from '../constants/weather';

export default function HomeScreen() {
  const { weather, loading: weatherLoading, error: weatherError, refetch } = useWeather();
  const { message, loading: messageLoading, error: messageError, generate } = useMessage();
  const [preference, setPreference] = useState<Preference>('comfort');

  const now = new Date();
  const timeOfDay = TIME_OF_DAY_KO[getTimeOfDay(now.getHours())];
  const dayOfWeek = DAY_OF_WEEK_KO[now.getDay()];

  // AsyncStorage에서 취향 로드
  useEffect(() => {
    getPreference().then(setPreference);
  }, []);

  // 메시지 생성 후 AsyncStorage에 저장
  useEffect(() => {
    if (message && weather) {
      saveMessage(message, weather.emoji).catch(console.error);
    }
  }, [message]);

  const handleGenerateMessage = () => {
    if (weather) {
      generate(weather, preference);
    }
  };

  const handleShare = async () => {
    if (!message || !weather) return;
    const days = DAY_OF_WEEK_KO;
    const d = new Date();
    await Share.share({
      message: `${weather.emoji} ${days[d.getDay()]} ${timeOfDay}\n\n${message.text}\n\n— 하우웨더유 (How Weather You)`,
    });
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.context}>
        {dayOfWeek} {timeOfDay}
      </Text>

      {/* 날씨 카드 */}
      {weatherLoading && <ActivityIndicator color="#ffffff" style={{ marginTop: 24 }} />}

      {weatherError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{weatherError}</Text>
          <TouchableOpacity onPress={refetch} style={styles.retryButton}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      )}

      {weather && !weatherLoading && (
        <View style={styles.weatherCard}>
          <Text style={styles.emoji}>{weather.emoji}</Text>
          <Text style={styles.condition}>{weather.conditionKo}</Text>
          <Text style={styles.temp}>{weather.temp}°C</Text>
          <Text style={styles.city}>{weather.city}</Text>
        </View>
      )}

      {/* 메시지 생성 버튼 */}
      {weather && !weatherLoading && (
        <TouchableOpacity
          style={[styles.generateButton, messageLoading && styles.generateButtonDisabled]}
          onPress={handleGenerateMessage}
          disabled={messageLoading}
        >
          {messageLoading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.generateButtonText}>
              {message ? '메시지 다시 생성' : '오늘의 메시지 받기'}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* 에러 */}
      {messageError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{messageError}</Text>
        </View>
      )}

      {/* 메시지 카드 */}
      {message && (
        <View style={styles.messageCard}>
          <Text style={styles.messageText}>{message.text}</Text>
          <View style={styles.messageActions}>
            <TouchableOpacity onPress={handleShare} style={styles.messageActionBtn}>
              <Text style={styles.messageActionText}>↑ 공유</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.title}>하우웨더유</Text>
      <Text style={styles.subtitle}>How Weather You</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  context: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  weatherCard: {
    alignItems: 'center',
    marginVertical: 20,
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
  generateButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
    marginBottom: 16,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  messageCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: '#555',
  },
  messageText: {
    color: '#e0e0e0',
    fontSize: 16,
    lineHeight: 26,
  },
  messageActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  messageActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
  },
  messageActionText: {
    color: '#888',
    fontSize: 13,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 12,
    color: '#2a2a2a',
    marginTop: 4,
  },
  errorBox: {
    alignItems: 'center',
    marginVertical: 12,
    width: '100%',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 10,
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
