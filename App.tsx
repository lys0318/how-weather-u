import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';

// 백그라운드 태스크 정의 (구버전 호환용)
import { unregisterBackgroundTask } from './src/tasks/backgroundTask';
unregisterBackgroundTask();

// Sentry 에러 모니터링 (DSN 없으면 skip)
import { initSentry } from './src/lib/sentry';
initSentry();

// AdMob 초기화 (네이티브 모듈 없는 빌드에선 graceful skip)
import { initAds } from './src/services/ads';
initAds();

// 인앱 업데이트 체크 (새 버전 있으면 강제 업데이트)
import { checkForUpdate } from './src/services/inAppUpdate';
checkForUpdate();

// 포그라운드 알림 표시 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LoginScreen from './src/screens/LoginScreen';
import PermissionSetupScreen from './src/screens/PermissionSetupScreen';
import { getHasOnboarded } from './src/utils/storage';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { LanguageProvider, useI18n } from './src/i18n';

export type RootStackParamList = {
  Login: undefined;
  PermissionSetup: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  History: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  const { t } = useI18n();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#1a1a1a', borderTopColor: '#333' },
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: '#666666',
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: t('tabs.history'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function LoadingScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0f0f0f', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color="#ffffff" />
    </View>
  );
}

function AppNavigator() {
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const { session, loading: authLoading } = useAuth();

  useEffect(() => {
    getHasOnboarded().then((value) => setHasOnboarded(value));
  }, []);

  if (hasOnboarded === null || authLoading) {
    return <LoadingScreen />;
  }

  // 라우팅 결정:
  // 1) 로그인 안 됨 → Login
  // 2) 로그인됐는데 권한 설정 안 함 → PermissionSetup
  // 3) 둘 다 OK → Main
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : !hasOnboarded ? (
          <Stack.Screen name="PermissionSetup">
            {() => <PermissionSetupScreen onDone={() => setHasOnboarded(true)} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </LanguageProvider>
  );
}
