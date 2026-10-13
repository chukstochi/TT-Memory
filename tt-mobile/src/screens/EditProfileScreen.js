import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { s, P, Header, Field, Btn } from '../shared';
import { useApp, initials } from '../store';

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function EditProfileScreen({ navigation }) {
  const { user, updateProfile } = useApp();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [photo, setPhoto] = useState(user?.photo || null);

  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!r.canceled) setPhoto(r.assets[0].uri);
  };

  const save = () => {
    if (!name.trim()) return Alert.alert('Name needed', 'Please enter your name.');
    updateProfile({ name: name.trim(), phone: phone.trim(), photo });
    navigation.goBack();
  };

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Header title="Edit Profile" back />

        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <Pressable onPress={pickPhoto}>
            <View style={[s.avatar, { width: 96, height: 96, borderRadius: 48, overflow: 'hidden' }]}>
              {photo ? <Image source={{ uri: photo }} style={{ width: 96, height: 96 }} /> : <Text style={{ fontSize: 32, fontWeight: '800', color: P }}>{initials(name)}</Text>}
            </View>
            <View style={[s.camera, { right: -2, bottom: -2, width: 34, height: 34, borderRadius: 17 }]}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </Pressable>
          {photo && (
            <Pressable onPress={() => setPhoto(null)} hitSlop={8} style={{ marginTop: 12 }}>
              <Text style={{ color: '#D64545', fontWeight: '700' }}>Remove photo</Text>
            </Pressable>
          )}
        </View>

        <Field label="Full name" placeholder="Your name" value={name} onChangeText={setName} />
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontWeight: '700', marginBottom: 6 }}>Email address</Text>
          <View style={{ backgroundColor: '#F1EEF6', borderRadius: 12, padding: 14 }}>
            <Text style={{ color: '#575363' }}>{user?.email}</Text>
          </View>
          <Text style={[s.muted, { marginTop: 6 }]}>This is your login, so it cannot be changed here.</Text>
        </View>
        <Field label="Phone (optional)" placeholder="+234 800 000 0000" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Btn onPress={save}>Save Changes</Btn>
      </ScrollView>
    </View>
  );
}