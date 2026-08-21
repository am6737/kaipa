import React from 'react';
import { Theme } from '../../theme/theme';
import { CircleBtn } from '../../components/CircleBtn';
import { IconName } from '../../components/Icon';
import { layout } from '../tokens';

export function AppIconButton({
  theme,
  name,
  onPress,
  noShadow,
  softShadow,
  active,
  danger,
  accessibilityLabel,
  size = layout.iconButton,
}: {
  theme: Theme;
  name: IconName;
  onPress: () => void;
  noShadow?: boolean;
  softShadow?: boolean;
  active?: boolean;
  danger?: boolean;
  accessibilityLabel?: string;
  size?: number;
}) {
  return <CircleBtn {...{ theme, name, onPress, noShadow, softShadow, active, danger, size, accessibilityLabel }} />;
}
