import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';

// 백그라운드 태스크는 최상단에서 import해야 등록됨
import './src/tasks/backgroundTask';

import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export type RootStackParamList = {
  Onboarding: undefined;
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

export default function App() {
  const hasOnboarded = true; // S5에서 AsyncStorage로 대체 예정

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!hasOnboarded ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : null}
        <Stack.Screen name="Main" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
