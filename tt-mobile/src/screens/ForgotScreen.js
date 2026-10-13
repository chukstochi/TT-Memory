import React, { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { s, Logo, Btn, Field } from '../shared';
import { forgotPassword, resetPassword } from '../api';

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function ForgotScreen({ navigation, route }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState(route.params?.email || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (busy) return;
    if (!isEmail(email)) return Alert.alert('Check your email', 'Enter a valid email address.');
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      setStep(2);
      Alert.alert('Check your email', 'If an account exists for that email, we sent a 6-digit code. It works for 15 minutes.');
    } catch (e) {
      Alert.alert('Could not send the code', e.message);
    }
    setBusy(false);
  };

  const reset = async () => {
    if (busy) return;
    if (code.trim().length !== 6) return Alert.alert('Code needed', 'Enter the 6-digit code from your email.');
    if (password.length < 8) return Alert.alert('Password too short', 'Use at least 8 characters.');
    setBusy(true);
    try {
      await resetPassword({ email: email.trim(), code: code.trim(), password });
      Alert.alert('Password changed', 'Log in with your new password.');
      navigation.replace('Login', { email: email.trim() });
    } catch (e) {
      Alert.alert('Could not reset the password', e.message);
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.auth} keyboardShouldPersistTaps="handled">
        <Logo />
        <Text style={s.authTitle}>Reset password</Text>
        <Text style={s.authSub}>
          {step === 1 ? 'Enter your email and we will send you a code.' : 'Enter the code we emailed you and choose a new password.'}
        </Text>
        <Field label="Email Address" placeholder="Enter your email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        {step === 2 && (
          <>
            <Field label="6-digit code" placeholder="123456" value={code} onChangeText={setCode} keyboardType="numeric" />
            <Field label="New password" placeholder="At least 8 characters" pass value={password} onChangeText={setPassword} />
          </>
        )}
        <Btn onPress={step === 1 ? sendCode : reset}>{busy ? 'Please wait…' : step === 1 ? 'Send code' : 'Change password'}</Btn>
        {step === 2 && (
          <View style={{ marginTop: 12 }}>
            <Btn outline onPress={sendCode}>Send a new code</Btn>
          </View>
        )}
      </ScrollView>
    </View>
  );
}