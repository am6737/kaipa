import React from 'react';
import { Text, View } from 'react-native';
import { Theme } from '../../theme/theme';
import { space, type } from '../tokens';

export function AppSectionHeader({
  theme,
  text,
  trailing,
  marginTop = 22,
  variant = 'eyebrow',
}: {
  theme: Theme;
  text: string;
  trailing?: React.ReactNode;
  marginTop?: number;
  variant?: 'eyebrow' | 'title';
}) {
  const title = variant === 'title';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop,
        marginBottom: title ? space.sm : space.xs,
      }}
    >
      <Text
        style={[
          title ? type.sectionTitle : type.eyebrow,
          { color: title ? theme.text : theme.text3, textTransform: title ? 'none' : 'uppercase' },
        ]}
      >
        {text}
      </Text>
      {trailing}
    </View>
  );
}
