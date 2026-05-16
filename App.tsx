import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

// 백그라운드 태스크 정의 (구버전 호환용)
import { unregisterBackgroundTask } from './src/tasks/backgroundTask';
unregisterBackgroundTask();

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
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#1a1a1a', borderTopColor: '#333' },
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: '#666666',
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: '홈' }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: '히스토리' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: '설정' }} />
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
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
