import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { P, M, T } from './shared';

// A small pop-up that asks for one or more passwords (works on Android and iPhone).
// fields: [{ key, label }]. onConfirm(values) may throw an Error whose message is shown.
export default function PasswordPrompt({ visible, title, text, fields, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState({});

  useEffect(() => {
    if (visible) {
      setValues({});
      setError('');
      setBusy(false);
      setShown({});
    }
  }, [visible]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(values);
    } catch (e) {
      setError(e.message || 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: T }}>{title}</Text>
          {!!text && <Text style={{ color: M, marginTop: 6 }}>{text}</Text>}
          {fields.map((f) => (
            <View key={f.key} style={{ marginTop: 14 }}>
              <Text style={{ fontWeight: '700', color: T, marginBottom: 6 }}>{f.label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2DFEA', borderRadius: 12 }}>
                <TextInput
                  secureTextEntry={!shown[f.key]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={values[f.key] || ''}
                  onChangeText={(v) => setValues((x) => ({ ...x, [f.key]: v }))}
                  style={{ flex: 1, padding: 12, fontSize: 16 }}
                />
                <Pressable onPress={() => setShown((x) => ({ ...x, [f.key]: !x[f.key] }))} hitSlop={10} style={{ paddingHorizontal: 12 }}>
                  <Ionicons name={shown[f.key] ? 'eye-off-outline' : 'eye-outline'} size={22} color={M} />
                </Pressable>
              </View>
            </View>
          ))}
          {!!error && <Text style={{ color: '#B03030', marginTop: 12 }}>{error}</Text>}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
            <Pressable onPress={onClose} disabled={busy} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
              <Text style={{ fontWeight: '700', color: M }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={busy}
              style={{ paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, backgroundColor: danger ? '#D64545' : P, minWidth: 96, alignItems: 'center' }}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ fontWeight: '800', color: '#fff' }}>{confirmLabel}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}