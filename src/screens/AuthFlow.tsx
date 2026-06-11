// AuthFlow.tsx — sign-in / register entry screen. On success the app unlocks.
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../theme/theme';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { elevAccent } from '../theme/shadow';

function Field({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 52,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
      }}
    >
      {children}
    </View>
  );
}

export function AuthFlow({ theme, onSuccess }: { theme: Theme; onSuccess: () => void }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(false);

  const valid = /\S+@\S+\.\S+/.test(email) && pwd.length >= 6 && agree;

  const social = [
    { id: 'wechat', label: '微信', bg: '#07C160' },
    { id: 'apple', label: 'Apple', bg: theme.dark ? '#fff' : '#000' },
    { id: 'google', label: 'Google', bg: theme.dark ? 'rgba(255,255,255,0.1)' : '#fff' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 60, paddingHorizontal: 28, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
          {/* brand */}
          <LinearGradient
            colors={[theme.accent, theme.accent + 'c8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[{ width: 66, height: 66, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 22 }, elevAccent(theme.accent)]}
          >
            <Text style={{ fontSize: 34, fontWeight: '800', color: '#fff' }}>开</Text>
          </LinearGradient>
          <Text style={{ fontSize: 28, fontWeight: '800', color: theme.text, letterSpacing: 0.2 }}>欢迎来到 kaipa</Text>
          <Text style={{ fontSize: 14, color: theme.text2, marginTop: 8, lineHeight: 20 }}>记录每一段徒步，和同行的人分享旅程。</Text>

          <View style={{ gap: 12, marginTop: 30 }}>
            <Field theme={theme}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="邮箱"
                placeholderTextColor={theme.text3}
                autoCapitalize="none"
                keyboardType="email-address"
                style={{ flex: 1, fontSize: 16, color: theme.text, padding: 0 }}
              />
            </Field>
            <Field theme={theme}>
              <TextInput
                value={pwd}
                onChangeText={setPwd}
                placeholder="密码"
                placeholderTextColor={theme.text3}
                secureTextEntry={!show}
                style={{ flex: 1, fontSize: 16, color: theme.text, padding: 0 }}
              />
              <Press onPress={() => setShow((s) => !s)}>
                <Icon name={show ? 'eyeOff' : 'eye'} color={theme.text3} size={20} />
              </Press>
            </Field>
          </View>

          <Press
            onPress={() => valid && onSuccess()}
            style={[{ height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 18, backgroundColor: valid ? theme.accent : theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }, valid ? elevAccent(theme.accent) : null]}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: valid ? '#fff' : theme.text3, letterSpacing: 0.2 }}>登录 / 注册</Text>
          </Press>

          <Press onPress={() => setAgree((a) => !a)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingHorizontal: 2 }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: agree ? theme.accent : 'transparent', borderWidth: agree ? 0 : 1.5, borderColor: theme.text3 }}>
              {agree && <Icon name="check" color="#fff" size={12} />}
            </View>
            <Text style={{ flex: 1, fontSize: 11.5, color: theme.text2, lineHeight: 16 }}>
              我已阅读并同意 <Text style={{ color: theme.accent }}>用户协议</Text> 与 <Text style={{ color: theme.accent }}>隐私政策</Text>
            </Text>
          </Press>

          <View style={{ flex: 1 }} />

          {/* social */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 40, marginBottom: 18 }}>
            <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
            <Text style={{ fontSize: 11.5, color: theme.text3 }}>其他方式登录</Text>
            <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
            {social.map((s) => (
              <Press
                key={s.id}
                onPress={() => onSuccess()}
                style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: s.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: s.id === 'apple' ? (theme.dark ? '#000' : '#fff') : s.id === 'google' ? theme.text : '#fff' }}>{s.label[0]}</Text>
              </Press>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
