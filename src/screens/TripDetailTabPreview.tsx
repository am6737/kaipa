import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';

type DayCardProps = {
  title: string;
  time: string;
  note?: string;
  thumbnails: Array<{ color: string; accent?: string }>;
};

function IconCard() {
  return (
    <View style={styles.iconCard}>
      <View style={styles.iconSheet}>
        <View style={styles.iconLine} />
        <View style={[styles.iconLine, { width: 14, marginTop: 7 }]} />
      </View>
    </View>
  );
}

function DayCard({ title, time, note, thumbnails }: DayCardProps) {
  return (
    <View style={styles.dayRow}>
      <IconCard />
      <View style={styles.dayContent}>
        <Text style={styles.badge}>自定义</Text>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{time}</Text>
          <Pressable hitSlop={12} style={styles.editHit}>
            <View style={styles.editIcon}>
              <View style={styles.editSlash} />
              <View style={styles.editBase} />
            </View>
          </Pressable>
        </View>
        {note ? <Text style={styles.note}>{note}</Text> : null}
        <View style={styles.mediaCard}>
          <View style={styles.thumbRow}>
            {thumbnails.map((item, index) => (
              <View key={`${item.color}-${index}`} style={[styles.thumb, { backgroundColor: item.color }]}>
                <View style={[styles.thumbAccent, { backgroundColor: item.accent ?? 'rgba(255,255,255,0.55)' }]} />
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function PillButton({
  label,
  width,
  icon,
}: {
  label: string;
  width: number;
  icon: React.ReactNode;
}) {
  return (
    <Pressable style={[styles.pill, { width }]}>
      {icon}
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

export function TripDetailTabPreview() {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const contentWidth = isWide ? 860 : '100%';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.page}>
        <LinearGradient
          colors={['#FCFCFD', '#F7F8FC', '#F5F6FA']}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.shell, isWide && styles.shellWide, { width: contentWidth }]}>
          <View style={styles.topBar}>
            <Pressable hitSlop={12} style={styles.topIcon}>
              <Text style={styles.topIconText}>‹</Text>
            </Pressable>
            <View style={styles.topBarRight}>
              <Pressable hitSlop={12} style={styles.topCircle}>
                <Text style={styles.topCircleText}>↗</Text>
              </Pressable>
              <Pressable hitSlop={12} style={styles.topCircle}>
                <Text style={styles.topCircleText}>⬡</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                {['总览', 'DAY 1', 'DAY 2', 'DAY 3', 'DAY 4', 'DAY 5'].map((label, index) => {
                  const active = index === 1;
                  return (
                    <View key={label} style={styles.tabWrap}>
                      <Text style={[styles.tab, active && styles.tabActive]}>{label}</Text>
                      {active ? <View style={styles.tabUnderline} /> : null}
                    </View>
                  );
                })}
              </ScrollView>

              <DayCard
                title="很尴尬"
                time="00:59"
                thumbnails={[
                  { color: '#DCC79A', accent: '#7F5A29' },
                  { color: '#A84A2C', accent: '#F5C168' },
                ]}
              />

              <View style={styles.addRow}>
                <Text style={styles.addPlus}>＋</Text>
                <Text style={styles.addText}>添加</Text>
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.dayLabel}>DAY 2</Text>
                <Text style={styles.dayNote}>添加备注</Text>
                <Text style={styles.chevron}>⌃</Text>
              </View>

              <DayCard
                title="基督教BCB"
                time="00:02 - 01:14"
                note="备注"
                thumbnails={[
                  { color: '#A72248', accent: '#F0C162' },
                  { color: '#F4F6FB', accent: '#BFD2EE' },
                ]}
              />

              <View style={styles.bottomBar}>
                <PillButton
                  width={355}
                  label="给圆周发送消息..."
                  icon={<View style={styles.chatIcon} />}
                />
                <PillButton
                  width={120}
                  label="编辑"
                  icon={<View style={styles.editGlyph} />}
                />
                <Pressable style={styles.fab}>
                  <Text style={styles.fabPlus}>＋</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7FB' },
  page: { flex: 1, position: 'relative' },
  shell: { flex: 1, alignSelf: 'stretch' },
  shellWide: { alignSelf: 'center' },
  topBar: {
    height: 108,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topIcon: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topIconText: { fontSize: 48, lineHeight: 48, color: '#111' },
  topBarRight: { flexDirection: 'row', gap: 14 },
  topCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topCircleText: { fontSize: 26, color: '#111' },
  scrollContent: { paddingBottom: 28 },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    paddingTop: 14,
    paddingBottom: 34,
    minHeight: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: -2 },
  },
  handle: {
    width: 58,
    height: 8,
    borderRadius: 4,
    alignSelf: 'center',
    backgroundColor: '#C8CBD6',
    marginBottom: 22,
  },
  tabs: { paddingHorizontal: 18, gap: 34, alignItems: 'flex-end' },
  tabWrap: { alignItems: 'center' },
  tab: { fontSize: 26, color: '#A0A4B0', fontWeight: '700' },
  tabActive: { color: '#111' },
  tabUnderline: {
    marginTop: 10,
    width: 66,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#29B6E8',
  },
  dayRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 42,
    gap: 20,
  },
  iconCard: {
    width: 132,
    height: 132,
    borderRadius: 30,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconSheet: {
    width: 42,
    height: 52,
    borderRadius: 10,
    borderWidth: 4,
    borderColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconLine: {
    width: 16,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#111',
  },
  dayContent: { flex: 1, paddingTop: 6 },
  badge: { fontSize: 24, color: '#A1A5B0', fontWeight: '700' },
  title: {
    marginTop: 8,
    fontSize: 36,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.4,
  },
  timeRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontSize: 26, color: '#111', fontWeight: '500' },
  editHit: { paddingLeft: 18, paddingVertical: 6 },
  editIcon: { width: 24, height: 24 },
  editSlash: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#B8BCC8',
    transform: [{ rotate: '-45deg' }],
  },
  editBase: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#B8BCC8',
  },
  note: {
    marginTop: 8,
    alignSelf: 'flex-start',
    fontSize: 22,
    color: '#B2B7C5',
    backgroundColor: '#F7F8FC',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mediaCard: {
    marginTop: 10,
    minHeight: 152,
    backgroundColor: '#FFF',
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  thumbRow: { flexDirection: 'row', gap: 12 },
  thumb: {
    width: 100,
    height: 100,
    borderRadius: 20,
    overflow: 'hidden',
  },
  thumbAccent: {
    position: 'absolute',
    left: 14,
    top: 28,
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  addRow: {
    paddingHorizontal: 50,
    paddingTop: 26,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  addPlus: { fontSize: 52, color: '#B7BBC6', fontWeight: '300' },
  addText: { fontSize: 32, color: '#B7BBC6', fontWeight: '800' },
  sectionHeader: {
    marginTop: 40,
    paddingHorizontal: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayLabel: { fontSize: 36, fontWeight: '900', color: '#111' },
  dayNote: { position: 'absolute', left: 260, top: 10, fontSize: 22, fontWeight: '700', color: '#C1C5D0' },
  chevron: { fontSize: 28, color: '#C1C5D0', fontWeight: '700' },
  bottomBar: {
    marginTop: 40,
    paddingHorizontal: 54,
    paddingBottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  pill: {
    height: 104,
    borderRadius: 52,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  pillText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#D3C3F7',
  },
  chatIcon: {
    width: 30,
    height: 24,
    borderWidth: 3,
    borderColor: '#B07BEA',
    borderRadius: 7,
    transform: [{ translateY: -2 }],
  },
  editGlyph: {
    width: 28,
    height: 28,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderColor: '#111',
    transform: [{ rotate: '45deg' }],
  },
  fab: {
    marginLeft: 'auto',
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  fabPlus: { color: '#FFF', fontSize: 64, lineHeight: 64, fontWeight: '300' },
});

