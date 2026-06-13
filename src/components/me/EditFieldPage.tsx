// EditFieldPage.tsx — full-screen single-field editor (昵称 / 用户名 / 简介 /
// 手机号 / 邮箱 / 密码). 完成 lives in the nav bar. Mirrors the prototype EditPage.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { useI18n } from '../../i18n';
import { MePushPage } from './MePushPage';

export interface MeEditField {
  label: string;
  key: 'nick' | 'username' | 'bio' | 'phone' | 'email' | null;
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
    <Press onPress={() => onSave(val)} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: theme.accent }}>{t('common.done')}</Text>
    </Press>
  );

  return (
    <MePushPage theme={theme} title={field.label} onBack={onBack} right={done}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: field.multiline ? 'flex-start' : 'center',
            borderRadius: 12,
            backgroundColor: theme.surfaceTop,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.hairline,
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
              paddingHorizontal: 14,
              paddingVertical: 13,
              minHeight: field.multiline ? 110 : undefined,
              textAlignVertical: field.multiline ? 'top' : 'center',
            }}
          />
          {!field.multiline && val.length > 0 ? (
            <Press
              onPress={() => {
                setVal('');
                ref.current?.focus();
              }}
              style={{ paddingHorizontal: 12, paddingVertical: 12 }}
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
          <Text style={{ fontSize: 12, color: theme.text3, paddingHorizontal: 6, paddingTop: 11, lineHeight: 18 }}>
            {field.hint}
          </Text>
        ) : null}
      </View>
    </MePushPage>
  );
}
