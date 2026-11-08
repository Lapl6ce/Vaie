import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { SourceSerif4_400Regular, SourceSerif4_600SemiBold } from '@expo-google-fonts/source-serif-4';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import { AppStateProvider, useApp } from '../lib/AppState';
import { VoiceProvider } from '../voice/VoiceProvider';
import { initAudio } from '../voice/speaker';
import { CelebrationProvider } from '../components/Celebration';
import { FloatingVoice } from '../components/VoiceUI';
import { ServerDown } from '../components/ServerDown';
import { Wordmark } from '../components/Wordmark';
import { C } from '../theme';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { DUR, settle } from '../components/motion';

function Shell() {
  const { ready, serverStatus } = useApp();
  return (
    <VoiceProvider>
      <CelebrationProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: C.bg },
            // iOS-style push with parallax on both platforms; onboarding/role switches cross-fade.
            animation: 'ios_from_right',
            animationDuration: 380,
            gestureEnabled: true,
          }}
        >
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="onboarding/language" options={{ animation: 'fade' }} />
          <Stack.Screen name="onboarding/role" options={{ animation: 'fade' }} />
          <Stack.Screen name="student" options={{ animation: 'fade' }} />
          <Stack.Screen name="adult" options={{ animation: 'fade' }} />
          <Stack.Screen name="quiz" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="live" options={{ animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
        </Stack>
        <FloatingVoice />
        {ready && serverStatus === 'down' ? (
          <Animated.View entering={FadeIn.duration(DUR.base)} exiting={FadeOut.duration(DUR.base)} style={StyleSheet.absoluteFill}>
            <ServerDown />
          </Animated.View>
        ) : null}
        {!ready ? (
          <Animated.View exiting={FadeOut.duration(DUR.base)} style={[StyleSheet.absoluteFill, styles.splash]}>
            <Animated.View entering={settle()}>
              <Wordmark size={56} />
            </Animated.View>
          </Animated.View>
        ) : null}
      </CelebrationProvider>
    </VoiceProvider>
  );
}

export default function RootLayout() {
  // Source Serif 4 for headings and big numbers, Instrument Sans for everything else.
  // Indic scripts (Devanagari, Bengali, Tamil, …) fall back to Android's Noto fonts automatically.
  const [fontsLoaded, fontError] = useFonts({
    SourceSerif4_400Regular,
    SourceSerif4_600SemiBold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });
  useEffect(() => {
    initAudio();
  }, []);
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppStateProvider>
        <Shell />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
});
