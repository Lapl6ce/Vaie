import React from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useApp } from '../lib/AppState';
import { C } from '../theme';

/** Decides where to start: language picker -> role -> profile -> mode home. */
export default function Index() {
  const { ready, lang, profile, serverStatus } = useApp();
  if (!lang && ready) return <Redirect href="/onboarding/language" />;
  // Wait for the server: the saved profile is loaded from it.
  if (!ready || serverStatus !== 'ok') return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  if (!profile) return <Redirect href="/onboarding/role" />;
  return <Redirect href={profile.mode === 'student' ? '/student/learn' : '/adult/ask'} />;
}
