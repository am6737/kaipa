import React from 'react';
import { Text, View } from 'react-native';
import { Theme } from '../../theme/theme';
import { space, type } from '../tokens';

// Opens a single-question page: one direct question, then why it is asked.
export function AppQuestionHeader({ theme, question, description }: { theme: Theme; question: string; description?: string }) {
  return (
    <View>
      <Text accessibilityRole="header" style={[type.question, { color: theme.text }]}>{question}</Text>
      {description ? <Text style={[type.lead, { color: theme.text2, marginTop: space.md }]}>{description}</Text> : null}
    </View>
  );
}
