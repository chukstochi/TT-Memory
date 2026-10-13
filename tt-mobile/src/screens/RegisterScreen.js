import React, { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { s, Logo, Btn, Field, SocialRow } from '../shared';
import EmailPicker, { saveEmail } from '../EmailPicker';
import { useApp } from '../store';
import { register } from '../api';
import { saveToken } from '../session';

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function RegisterScreen({ navigation }) {
  const { signIn } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    if (!name.trim()) return Alert.alert('Name needed', 'Please enter your full name.');
    if (!isEmail(email)) return Alert.alert('Check your email', 'Enter a valid email address.');
    if (password.length < 8) return Alert.alert('Password too short', 'Use at least 8 characters.');
    setBusy(true);
    try {
      const r = await register({ name: name.trim(), email: email.trim(), password });
      await saveToken(r.token);
      await saveEmail(r.user.email);
      signIn({ name: r.user.name, email: r.user.email, verified: r.user.verified });
      navigation.replace('VerifyEmail', { sent: true });
    } catch (e) {
      Alert.alert('Could not create account', e.message);
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.auth} keyboardShouldPersistTaps="handled">
        <Logo />
        <Text style={s.authTitle}>Create your account</Text>
        <Text style={s.authSub}>Join TT Memory and start preserving your memories today.</Text>
        <Field label="Full Name" placeholder="Enter your full name" value={name} onChangeText={setName} />
        <Field label="Email Address" placeholder="Enter your email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Field label="Password" placeholder="At least 8 characters" pass value={password} onChangeText={setPassword} />
        <Btn onPress={create}>{busy ? 'Creating account…' : 'Create Account'}</Btn>
        <SocialRow onEmailPress={() => setPicker(true)} />
      </ScrollView>
      <EmailPicker visible={picker} onClose={() => setPicker(false)} onSelect={setEmail} />
    </View>
  );
}