import React from 'react';
import { Tabs } from 'expo-router/js-tabs';
import { S } from '../../i18n/strings';
import { tab, useTabOptions } from '../../components/TabBar';

export default function StudentTabs() {
  const options = useTabOptions();
  return (
    <Tabs screenOptions={options}>
      <Tabs.Screen name="learn" options={tab(S.tabLearn, 'map-marker-path')} />
      <Tabs.Screen name="leaderboard" options={tab(S.tabLeaderboard, 'podium-gold')} />
      <Tabs.Screen name="stats" options={tab(S.tabStats, 'chart-bar')} />
      <Tabs.Screen name="ask" options={tab(S.tabAsk, 'chat-question')} />
      <Tabs.Screen name="me" options={tab(S.tabMe, 'account-circle')} />
    </Tabs>
  );
}
