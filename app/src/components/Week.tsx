import React from 'react';
import { StyleSheet, View } from 'react-native';
import { C } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import type { StreakInfo } from '../lib/types';
import { Icon } from './ui';

const DAY_KEYS = [S.sun, S.mon, S.tue, S.wed, S.thu, S.fri, S.sat];
export const dayLabel = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return DAY_KEYS[new Date(y, m - 1, d).getDay()];
};

export function WeekCalendar({ streak }: { streak: StreakInfo }) {
  return (
    <View style={styles.week}>
      {streak.week.map((d) => {
        const done = d.status === 'done';
        const frozen = d.status === 'frozen';
        const today = d.status === 'today';
        return (
          <View key={d.day} style={{ alignItems: 'center', gap: 4, flex: 1 }}>
            <T style={{ fontSize: 13, fontWeight: '700', color: C.muted }} numberOfLines={1}>
              {dayLabel(d.day)}
            </T>
            <View
              style={[
                styles.dayCircle,
                done && { backgroundColor: C.terracotta },
                frozen && { backgroundColor: C.blue },
                today && { borderColor: C.gold, borderWidth: 3, borderStyle: 'dashed' },
              ]}
            >
              <Icon name={done ? 'fire' : frozen ? 'snowflake' : today ? 'help' : 'minus'} size={22} color={done || frozen ? C.white : C.locked} />
            </View>
          </View>
        );
      })}
    </View>
  );
}


const styles = StyleSheet.create({
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.border },
});
