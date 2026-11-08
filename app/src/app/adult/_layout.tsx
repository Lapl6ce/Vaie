import React from 'react';
import { Tabs } from 'expo-router/js-tabs';
import { S } from '../../i18n/strings';
import { tab, useTabOptions } from '../../components/TabBar';
import { useApp } from '../../lib/AppState';

export default function AdultTabs() {
  const options = useTabOptions();
  const { adultLearn } = useApp();
  return (
    <Tabs screenOptions={options}>
      <Tabs.Screen name="ask" options={tab(S.tabAsk, 'chat-question')} />
      <Tabs.Screen name="translate" options={tab(S.tabTranslate, 'translate')} />
      {/* Student lessons are optional for adults (Settings toggle). */}
      <Tabs.Screen name="learn" options={{ ...tab(S.tabLearn, 'map-marker-path'), href: adultLearn ? undefined : null }} />
      <Tabs.Screen name="me" options={tab(S.tabMe, 'account-circle')} />
    </Tabs>
  );
}
