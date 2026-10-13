import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { s, Logo, Btn, Field } from '../shared';
import { useApp } from '../store';
import { verifyEmail, resendVerification, fetchMe } from '../api';
import { requestSync } from '../cloud/sync';

export default function VerifyEmailScreen({ navigation, route }) {
  const { user, updateProfile } = useApp();
  const [sent, setSent] = useState(!!route.params?.sent);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const done = () => {
    updateProfile({ verified: true });
    try { requestSync(true); } catch (e) {}
    Alert.alert('Email verified', 'Thank you. Your email is confirmed.');
    navigation.replace('Home');
  };

  useEffect(() => {
    // Maybe it was already verified on another phone.
    fetchMe().then((r) => { if (r.user && r.user.verified) done(); }).catch(() => {});
    // eslint-disable-next-line
  }, []);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await resendVerification();
      if (r.verified) return done();
      setSent(true);
      Alert.alert('Check your email', `We sent a 6-digit code to ${user?.email}. It works for 15 minutes.`);
    } catch (e) {
      Alert.alert('Could not send the code', e.message);
    }
    setBusy(false);
  };

  const check = async () => {
    if (busy) return;
    if (code.trim().length !== 6) return Alert.alert('Code needed', 'Enter the 6-digit code from your email.');
    setBusy(true);
    try {
      await verifyEmail(code.trim());
      done();
    } catch (e) {
      Alert.alert('Could not verify', e.message);
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.auth} keyboardShouldPersistTaps="handled">
        <Logo />
        <Text style={s.authTitle}>Verify your email</Text>
        <Text style={s.authSub}>
          {sent ? `Enter the 6-digit code we sent to ${user?.email}.` : `We need to confirm ${user?.email} is yours before you can back up memories or buy a plan.`}
        </Text>
        {sent ? (
          <>
            <Field label="Verification code" placeholder="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" />
            <Btn onPress={check}>{busy ? 'Checking…' : 'Verify'}</Btn>
            <TouchableOpacity onPress={send} style={{ marginTop: 18 }}>
              <Text style={[s.link, { textAlign: 'center' }]}>Send me a new code</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Btn onPress={send}>{busy ? 'Sending…' : 'Send me a code'}</Btn>
        )}
        <TouchableOpacity onPress={() => navigation.replace('Home')} style={{ marginTop: 22 }}>
          <Text style={{ textAlign: 'center', color: '#8A8696' }}>Do this later</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}