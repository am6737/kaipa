// EditFieldPage.tsx — full-screen single-field editor (昵称 / 用户名 / 简介 /
// 手机号 / 邮箱 / 密码). 完成 lives in the nav bar. Mirrors the prototype EditPage.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { useI18n } from '../../i18n';
import { MePushPage } from './MePushPage';
import { radius, space, type } from '../../design-system';

export interface MeEditField {
  label: string;
  key: 'nick' | 'username' | 'bio' | 'phone' | 'email' | 'password' | null;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  type?: 'tel' | 'email' | 'password' | 'text';
  hint?: string;
  toast?: string;
}

export function EditFieldPage({
  theme,
  field,
  onBack,
  onSave,
}: {
  theme: Theme;
  field: MeEditField;
  onBack: () => void;
  onSave: (value: string) => void;
}) {
  const { t } = useI18n();
  const [val, setVal] = useState(field.value || '');
  const ref = useRef<TextInput>(null);
  useEffect(() => {
    const id = setTimeout(() => ref.current?.focus(), 340);
    return () => clearTimeout(id);
  }, []);

  const done = (
    <Press onPress={() => onSave(val)} scaleTo={1} opacityTo={1} style={{ minWidth: 54, height: 34, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.accent }}>{t('common.done')}</Text>
    </Press>
  );

  return (
    <MePushPage theme={theme} title={field.label} onBack={onBack} right={done}>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.xs }}>
        <Text style={[type.eyebrow, { color: theme.text3, marginBottom: space.xs }]}>{field.label}</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: field.multiline ? 'flex-start' : 'center',
            borderRadius: radius.feature,
            backgroundColor: theme.surfaceTop,
            borderWidth: 0,
          }}
        >
          <TextInput
            ref={ref}
            value={val}
            onChangeText={setVal}
            placeholder={field.placeholder}
            placeholderTextColor={theme.text3}
            multiline={field.multiline}
            secureTextEntry={field.type === 'password'}
            keyboardType={field.type === 'tel' ? 'phone-pad' : field.type === 'email' ? 'email-address' : 'default'}
            autoCapitalize="none"
            style={{
              flex: 1,
              fontSize: 16,
              color: theme.text,
              paddingHorizontal: space.md,
              paddingVertical: space.md,
              minHeight: field.multiline ? 150 : 56,
              textAlignVertical: field.multiline ? 'top' : 'center',
            }}
          />
          {!field.multiline && val.length > 0 ? (
            <Press
              onPress={() => {
                setVal('');
                ref.current?.focus();
              }}
              scaleTo={1}
              opacityTo={1}
              style={{ paddingHorizontal: space.md, paddingVertical: space.md }}
            >
              <View
                style={{
                  width: 19,
                  height: 19,
                  borderRadius: 10,
                  backgroundColor: theme.text3,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="close" color={theme.bg} size={12} />
              </View>
            </Press>
          ) : null}
        </View>
        {field.hint ? (
          <Text style={[type.caption, { color: theme.text3, paddingHorizontal: space.xs, paddingTop: space.sm, lineHeight: 18 }]}>
            {field.hint}
          </Text>
        ) : null}
      </View>
    </MePushPage>
  );
}
