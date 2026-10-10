import React from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '../../design-system';

/** Keep categories intact and balance the columns using estimated name wrapping. */
export function GuideEquipmentColumns<T>({ groups, itemNames, renderGroup, columns: columnCount = 2 }: {
  groups: T[];
  itemNames: (group: T) => string[];
  renderGroup: (group: T) => React.ReactNode;
  /** Set to 1 for the compact single-column presentation. */
  columns?: 1 | 2;
}) {
  const columns: { groups: T[]; score: number }[] = Array.from({ length: columnCount }, () => ({ groups: [], score: 0 }));
  for (const group of groups) {
    const column = columns.reduce((shortest, candidate) => candidate.score <= shortest.score ? candidate : shortest);
    column.groups.push(group);
    column.score += 2 + itemNames(group).reduce((sum, name) => sum + Math.max(1, Math.ceil(name.length / 8)), 0);
  }
  return <View style={styles.grid}>
    {columns.map((column, index) => <View key={index} style={styles.column}>
      {column.groups.map(renderGroup)}
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg },
  column: { flex: 1, minWidth: 0, gap: 12 },
});
