import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, AppState, Alert, Switch } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { useNavigation } from '@react-navigation/native';
import { s, P, G, M, Header, Btn, Thumb } from '../shared';
import { useApp } from '../store';
import { keyFor } from '../accountKey';

const MAX_TRIES = 5;
const LOCK_SECONDS = 30;

function Dots({ count }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14, marginVertical: 24 }}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: '#fff', backgroundColor: i < count ? '#fff' : 'transparent' }}
        />
      ))}
    </View>
  );
}

function Pad({ onDigit, onBack, onBio, disabled }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'back'];
  return (
    <View style={s.keys}>
      {keys.map((k) => {
        if (k === 'bio') {
          return onBio ? (
            <Pressable key={k} onPress={onBio} style={s.key}>
              <Ionicons name="finger-print" size={26} color="#fff" />
            </Pressable>
          ) : (
            <View key={k} style={{ width: 70, height: 58 }} />
          );
        }
        if (k === 'back') {
          return (
            <Pressable key={k} onPress={onBack} style={s.key}>
              <Ionicons name="backspace-outline" size={24} color="#fff" />
            </Pressable>
          );
        }
        return (
          <Pressable key={k} onPress={() => onDigit(k)} style={[s.key, disabled && { opacity: 0.4 }]}>
            <Text style={{ color: '#fff', fontSize: 21 }}>{k}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function VaultScreen() {
  const n = useNavigation();
  const { vaultItems, user } = useApp();
  const PIN_KEY = keyFor('tt_vault_pin', user && user.email);
  const BIO_KEY = keyFor('tt_vault_bio', user && user.email);

  const [mode, setMode] = useState('loading'); // loading | setup | confirm | locked | open
  const [stored, setStored] = useState(null);
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const [fails, setFails] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [bioAvail, setBioAvail] = useState(false);
  const [bioOn, setBioOn] = useState(false);

  const remaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  // Load saved PIN and check what the phone can do.
  useEffect(() => {
    (async () => {
      try {
        const p = await SecureStore.getItemAsync(PIN_KEY);
        const b = await SecureStore.getItemAsync(BIO_KEY);
        const hw = await LocalAuthentication.hasHardwareAsync();
        const en = await LocalAuthentication.isEnrolledAsync();
        setBioAvail(hw && en);
        setBioOn(b === '1');
        if (p) {
          setStored(p);
          setMode('locked');
        } else {
          setMode('setup');
        }
      } catch {
        setMode('setup');
      }
    })();
  }, []);

  // Lock again whenever the app goes to the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') {
        setMode((m) => (m === 'open' ? 'locked' : m));
        setPin('');
      }
    });
    return () => sub.remove();
  }, []);

  // Countdown while locked out.
  useEffect(() => {
    if (lockedUntil <= Date.now()) return undefined;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockedUntil) {
        clearInterval(id);
        setError('');
      }
    }, 500);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const unlock = () => {
    setFails(0);
    setPin('');
    setError('');
    setMode('open');
  };

  const tryBio = async () => {
    try {
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock your vault',
        cancelLabel: 'Use PIN',
        disableDeviceFallback: true,
      });
      if (r.success) unlock();
    } catch {}
  };

  // Offer fingerprint / Face ID straight away when it is turned on.
  useEffect(() => {
    if (mode === 'locked' && bioOn && bioAvail) tryBio();
  }, [mode, bioOn, bioAvail]);

  const savePin = async (p) => {
    try {
      await SecureStore.setItemAsync(PIN_KEY, p);
      if (bioAvail && (await SecureStore.getItemAsync(BIO_KEY)) === null) {
        await SecureStore.setItemAsync(BIO_KEY, '1');
        setBioOn(true);
      }
      setStored(p);
      setPin('');
      setFirst('');
      setError('');
      setMode('open');
    } catch {
      Alert.alert('Could not save PIN', 'Your phone would not store the PIN securely. Please try again.');
      setPin('');
      setFirst('');
      setMode('setup');
    }
  };

  // React when four digits have been entered.
  useEffect(() => {
    if (pin.length !== 4) return;
    if (mode === 'locked') {
      if (pin === stored) {
        unlock();
      } else {
        const f = fails + 1;
        setPin('');
        if (f >= MAX_TRIES) {
          setFails(0);
          setLockedUntil(Date.now() + LOCK_SECONDS * 1000);
          setNow(Date.now());
          setError('Too many wrong attempts');
        } else {
          setFails(f);
          setError(`Wrong PIN. ${MAX_TRIES - f} ${MAX_TRIES - f === 1 ? 'try' : 'tries'} left`);
        }
      }
    } else if (mode === 'setup') {
      setFirst(pin);
      setPin('');
      setError('');
      setMode('confirm');
    } else if (mode === 'confirm') {
      if (pin === first) {
        savePin(pin);
      } else {
        setError('PINs did not match. Try again.');
        setPin('');
        setFirst('');
        setMode('setup');
      }
    }
  }, [pin]);

  const press = (d) => {
    if (remaining > 0 || pin.length >= 4) return;
    setError('');
    setPin(pin + d);
  };

  const forgot = async () => {
    try {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Verify it is you to reset your PIN' });
      if (r.success) {
        setPin('');
        setFirst('');
        setError('');
        setMode('setup');
      } else if (r.error === 'not_enrolled') {
        Alert.alert('Screen lock needed', 'Set a screen lock (PIN, pattern or fingerprint) on your phone first, then try again.');
      }
    } catch {
      Alert.alert('Not available', 'Your phone could not verify you. Try again later.');
    }
  };

  const toggleBio = (v) => {
    setBioOn(v);
    SecureStore.setItemAsync(BIO_KEY, v ? '1' : '0').catch(() => {});
  };

  const cancelSetup = () => {
    setPin('');
    setFirst('');
    setError('');
    setMode('open');
  };

  if (mode === 'open') {
    return (
      <View style={s.screen}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Header title="Vault" sub="Your private space" back />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn style={{ flex: 1 }} onPress={() => n.navigate('Add', { vault: true })}>Add to Vault</Btn>
            <Btn outline style={{ flex: 1 }} onPress={() => { setPin(''); setError(''); setMode('locked'); }}>Lock now</Btn>
          </View>

          <Text style={s.section}>Private memories ({vaultItems.length})</Text>
          {vaultItems.length === 0 ? (
            <Text style={s.muted}>
              Nothing here yet. Tap Add to Vault, or open any memory and choose Move to Vault. Vault memories are hidden from your library, search and family sharing.
            </Text>
          ) : (
            <View style={s.grid}>
              {vaultItems.map((m) => (
                <Pressable key={m.id} onPress={() => n.navigate('MemoryDetail', { id: m.id })}>
                  <Thumb m={m} style={s.gridImg} />
                </Pressable>
              ))}
            </View>
          )}

          <Text style={s.section}>Security</Text>
          <Pressable style={[s.timeline, { alignItems: 'center' }]} onPress={() => { setPin(''); setFirst(''); setError(''); setMode('setup'); }}>
            <View style={s.qIcon}><Ionicons name="keypad-outline" size={20} color={P} /></View>
            <Text style={[s.card, { flex: 1 }]}>Change PIN</Text>
            <Ionicons name="chevron-forward" size={18} color={M} />
          </Pressable>
          {bioAvail && (
            <View style={[s.timeline, { alignItems: 'center' }]}>
              <View style={s.qIcon}><Ionicons name="finger-print" size={20} color={P} /></View>
              <Text style={[s.card, { flex: 1 }]}>Unlock with fingerprint or Face ID</Text>
              <Switch value={bioOn} onValueChange={toggleBio} trackColor={{ true: P }} />
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  const info = {
    loading: { icon: 'lock-closed', title: '', sub: '' },
    setup: { icon: 'lock-closed', title: 'Create a PIN', sub: 'Choose a 4-digit PIN to protect your vault.' },
    confirm: { icon: 'lock-closed', title: 'Confirm your PIN', sub: 'Enter the same PIN again.' },
    locked: { icon: 'finger-print', title: 'Vault', sub: remaining > 0 ? `Try again in ${remaining}s` : 'Enter your PIN to open your vault.' },
  }[mode];

  return (
    <LinearGradient colors={[P, '#171044']} style={s.dark}>
      <StatusBar style="light" />
      <View style={{ padding: 20, paddingTop: 50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={() => n.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={27} color="#fff" />
        </Pressable>
        {stored && (mode === 'setup' || mode === 'confirm') && (
          <Pressable onPress={cancelSetup} hitSlop={10}>
            <Text style={{ color: G, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
        )}
      </View>
      {mode !== 'loading' && (
        <View style={s.vault}>
          <Ionicons name={info.icon} size={54} color="#fff" />
          <Text style={s.vTitle}>{info.title}</Text>
          <Text style={[s.vSub, { marginTop: 6 }]}>{info.sub}</Text>
          <Dots count={pin.length} />
          <Text style={{ color: '#FF9A9A', height: 20, marginBottom: 10 }}>{error}</Text>
          <Pad
            onDigit={press}
            onBack={() => setPin(pin.slice(0, -1))}
            onBio={mode === 'locked' && bioOn && bioAvail ? tryBio : null}
            disabled={remaining > 0}
          />
          {mode === 'locked' && (
            <Pressable onPress={forgot} hitSlop={10} style={{ marginTop: 22 }}>
              <Text style={{ color: G, fontWeight: '700' }}>Forgot PIN?</Text>
            </Pressable>
          )}
        </View>
      )}
    </LinearGradient>
  );
}