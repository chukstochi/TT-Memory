import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, TextInput, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { P, G, M, T } from './shared';

const KEY = 'tt_saved_emails';
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export async function loadEmails() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveEmail(email) {
  const e = email.trim().toLowerCase();
  if (!isEmail(e)) return;
  const list = await loadEmails();
  const next = [e, ...list.filter((x) => x !== e)].slice(0, 6);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

export default function EmailPicker({ visible, onClose, onSelect }) {
  const [emails, setEmails] = useState([]);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setValue('');
      setError('');
      loadEmails().then(setEmails);
    }
  }, [visible]);

  const choose = async (email) => {
    await saveEmail(email);
    onSelect(email.trim().toLowerCase());
    onClose();
  };

  const addNew = () => {
    if (!isEmail(value)) {
      setError('Enter a valid email address');
      return;
    }
    choose(value);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={st.sheet}>
        <View style={st.handle} />
        <Text style={st.title}>Choose an email</Text>
        <Text style={st.sub}>Pick one to fill in your details automatically.</Text>

        <FlatList
          data={emails}
          keyExtractor={(x) => x}
          style={{ maxHeight: 220 }}
          ListEmptyComponent={<Text style={st.empty}>No saved emails yet. Add one below.</Text>}
          renderItem={({ item }) => (
            <Pressable style={st.row} onPress={() => choose(item)}>
              <View style={st.avatar}><Text style={st.avatarT}>{item[0].toUpperCase()}</Text></View>
              <Text style={st.email} numberOfLines={1}>{item}</Text>
              <Ionicons name="chevron-forward" size={18} color={M} />
            </Pressable>
          )}
        />

        <Text style={st.label}>Use a different email</Text>
        <View style={st.inputRow}>
          <TextInput
            value={value}
            onChangeText={(v) => { setValue(v); setError(''); }}
            placeholder="name@example.com"
            placeholderTextColor="#AAA7B3"
            autoCapitalize="none"
            keyboardType="email-address"
            style={{ flex: 1 }}
          />
          <Pressable onPress={addNew} style={st.addBtn}>
            <Text style={st.addT}>Use</Text>
          </Pressable>
        </View>
        {!!error && <Text style={st.error}>{error}</Text>}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34 },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#DDD8E8', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', color: T },
  sub: { color: M, marginTop: 4, marginBottom: 14 },
  empty: { color: M, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F0EDF5' },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: G, alignItems: 'center', justifyContent: 'center' },
  avatarT: { fontWeight: '800', color: P },
  email: { flex: 1, color: T, fontSize: 15 },
  label: { fontSize: 12, fontWeight: '700', color: '#575363', marginTop: 18, marginBottom: 7 },
  inputRow: { height: 50, borderWidth: 1, borderColor: '#E4E1EA', borderRadius: 10, paddingLeft: 14, paddingRight: 6, flexDirection: 'row', alignItems: 'center' },
  addBtn: { height: 38, paddingHorizontal: 16, borderRadius: 8, backgroundColor: P, alignItems: 'center', justifyContent: 'center' },
  addT: { color: '#fff', fontWeight: '800' },
  error: { color: '#D64545', marginTop: 6, fontSize: 12 },
});