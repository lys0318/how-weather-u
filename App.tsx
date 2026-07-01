import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { COLORS } from './src/constants/theme';

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

// 홈위젯 헤드리스 태스크 (앱 미실행 중 OS가 위젯을 그려야 할 때 — iOS는 no-op)
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { renderWidgetFromCache } from './src/services/widget';
registerWidgetTaskHandler(async (props) => {
  props.renderWidget(await renderWidgetFromCache());
});

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
import MessagingScreen from './src/screens/MessagingScreen';
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
  Messaging: undefined;
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
        tabBarStyle: { backgroundColor: COLORS.card, borderTopColor: COLORS.line, borderTopWidth: 1 },
        tabBarActiveTintColor: COLORS.ember,
        tabBarInactiveTintColor: COLORS.ink3,
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
        name="Messaging"
        component={MessagingScreen}
        options={{
          title: t('tabs.messaging'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses" size={size} color={color} />
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
    <View style={{ flex: 1, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color={COLORS.ember} />
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
  const [fontsLoaded, fontError] = useFonts({
    GowunBatang: require('./assets/fonts/GowunBatang-Regular.ttf'),
    GowunBatangBold: require('./assets/fonts/GowunBatang-Bold.ttf'),
    Newsreader: require('./assets/fonts/Newsreader-Regular.ttf'),
    NewsreaderLight: require('./assets/fonts/Newsreader-Light.ttf'),
    SplineSansMono: require('./assets/fonts/SplineSansMono-Regular.ttf'),
    SplineSansMonoMedium: require('./assets/fonts/SplineSansMono-Medium.ttf'),
  });

  // 폰트 로딩 전에는 로딩 화면 (에러 시엔 시스템 폰트로 폴백하며 진행)
  if (!fontsLoaded && !fontError) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
