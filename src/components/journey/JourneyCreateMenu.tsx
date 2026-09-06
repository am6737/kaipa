import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { FolderPlus, LockKeyhole, MapPinned, Plus, type LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Theme } from '../../theme/theme';
import { layout, motion, radius, space, type } from '../../design-system';
import { Press } from '../Press';

type JourneyCreateMenuProps = {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
  onCreate: () => void;
  onParse: () => void;
  onUseCode: () => void;
  labels: {
    close: string;
    create: string;
    parse: string;
    useCode: string;
  };
};

function MenuAction({
  theme,
  icon: ActionIcon,
  label,
  primary = false,
  onPress,
}: {
  theme: Theme;
  icon: LucideIcon;
  label: string;
  primary?: boolean;
  onPress: () => void;
}) {
  const backgroundColor = primary ? theme.accent : theme.controlSurface;
  const foregroundColor = primary ? '#FFFFFF' : theme.text;

  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.985}
      style={[
        styles.action,
        {
          backgroundColor,
          shadowColor: theme.text,
          shadowOpacity: theme.dark ? 0.3 : 0.12,
        },
      ]}
    >
      <View style={styles.actionIcon}>
        <ActionIcon color={foregroundColor} size={21} strokeWidth={2.1} />
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.84} style={[type.cardTitle, styles.actionLabel, { color: foregroundColor }]}>
        {label}
      </Text>
    </Press>
  );
}

export function JourneyCreateMenu({ theme, visible, onClose, onCreate, onParse, onUseCode, labels }: JourneyCreateMenuProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.quick,
      useNativeDriver: true,
    }).start();
  }, [progress, visible]);

  const close = (action?: () => void) => {
    Animated.timing(progress, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      onClose();
      action?.();
    });
  };

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={() => close()}>
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={labels.close}
            onPress={() => close()}
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(0,0,0,0.24)' : 'rgba(235,238,240,0.48)' }]}
          />
        </Animated.View>

        <Press
          accessibilityRole="button"
          accessibilityLabel={labels.close}
          onPress={() => close()}
          style={[styles.closeButton, { top: insets.top + space.sm + 6, right: 22 }]}
        >
          <Animated.View
            style={{
              transform: [{
                rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }),
              }],
            }}
          >
            <Plus color={theme.text} size={28} strokeWidth={2} />
          </Animated.View>
        </Press>

        <Animated.View
          style={[
            styles.menu,
            {
              top: insets.top + space.sm + 6 + layout.iconButton + space.xs,
              right: 20,
              width: Math.min(204, width - 52),
              opacity: progress,
              transform: [
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.975, 1] }) },
              ],
            },
          ]}
        >
          <MenuAction theme={theme} icon={FolderPlus} label={labels.create} primary onPress={() => close(onCreate)} />
          <MenuAction theme={theme} icon={MapPinned} label={labels.parse} onPress={() => close(onParse)} />
          <MenuAction theme={theme} icon={LockKeyhole} label={labels.useCode} onPress={() => close(onUseCode)} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    position: 'absolute',
    width: layout.iconButton,
    height: layout.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  menu: {
    position: 'absolute',
    gap: 6,
  },
  action: {
    height: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 8,
  },
  actionIcon: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    flex: 1,
    marginLeft: space.sm,
    fontSize: 15,
    letterSpacing: 0,
  },
});
