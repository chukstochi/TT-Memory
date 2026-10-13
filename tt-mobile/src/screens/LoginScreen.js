import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, Pressable } from 'react-native';
import { P, s, Logo, Btn, Field, SocialRow } from '../shared';
import EmailPicker, { saveEmail } from '../EmailPicker';
import { useApp } from '../store';
import { login as loginRequest } from '../api';
import { saveToken } from '../session';

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function LoginScreen({ navigation, route }) {
  const { signIn } = useApp();
  const [email, setEmail] = useState(route.params?.email || '');
  const [password, setPassword] = useState('');
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const login = async () => {
    if (busy) return;
    if (!isEmail(email)) return Alert.alert('Check your email', 'Enter a valid email address.');
    if (!password) return Alert.alert('Password needed', 'Please enter your password.');
    setBusy(true);
    try {
      const r = await loginRequest({ email: email.trim(), password });
      await saveToken(r.token);
      await saveEmail(r.user.email);
      signIn({ name: r.user.name, email: r.user.email, verified: r.user.verified });
      navigation.replace(r.user.verified ? 'Home' : 'VerifyEmail', { sent: false });
    } catch (e) {
      Alert.alert('Could not log in', e.message);
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.auth} keyboardShouldPersistTaps="handled">
        <Logo />
        <Text style={s.authTitle}>Welcome back</Text>
        <Text style={s.authSub}>Glad to see you again.</Text>
        <Field label="Email Address" placeholder="Enter your email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Field label="Password" placeholder="Enter your password" pass value={password} onChangeText={setPassword} />
        <View style={[s.rem, { justifyContent: 'flex-end' }]}>
          <Pressable onPress={() => navigation.navigate('Forgot', { email })}>
            <Text style={{ color: P }}>Forgot password?</Text>
          </Pressable>
        </View>
        <Btn onPress={login}>{busy ? 'Logging in…' : 'Log In'}</Btn>
        <SocialRow onEmailPress={() => setPicker(true)} />
      </ScrollView>
      <EmailPicker visible={picker} onClose={() => setPicker(false)} onSelect={setEmail} />
    </View>
  );
}