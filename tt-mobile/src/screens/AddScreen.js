import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { s, M, P, Header, Field, Btn, Thumb } from '../shared';
import { useApp, todayISO, PLANS, formatBytes } from '../store';

const MB = 1024 * 1024;
const sizeOf = (a) => a.fileSize || (a.type === 'video' ? 30 * MB : 3 * MB);
const toMemory = (a) => ({ uri: a.uri, type: a.type === 'video' ? 'video' : 'photo' });

export default function AddScreen({ navigation, route }) {
  const { addMemory, updateMemory, allMemories, plan, members } = useApp();
  const editing = allMemories.find((m) => m.id === route.params?.id);
  const inVault = editing ? !!editing.vault : !!route.params?.vault;

  const [assets, setAssets] = useState([]); // newly picked files
  // Photos or videos: the picker only offers this kind. Editing keeps the memory's own kind.
  const [mode, setMode] = useState(editing ? (editing.type === 'video' ? 'video' : 'photo') : 'photo');
  const mediaTypes = mode === 'video' ? ['videos'] : ['images'];
  const noun = mode === 'video' ? 'videos' : 'photos';
  const [title, setTitle] = useState(editing?.title || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [date, setDate] = useState(editing?.date || todayISO());
  const [location, setLocation] = useState(editing?.location || '');
  const [album, setAlbum] = useState(editing ? (editing.album === 'Unsorted' ? '' : editing.album || '') : '');
  const [shared, setShared] = useState(!!editing?.shared);
  const [sharedWith, setSharedWith] = useState(editing?.sharedWith || []);

  // Space left on the current plan. When replacing a photo while editing, its old size is freed.
  const planInfo = PLANS.find((p) => p.id === plan) || PLANS[0];
  const familyEnabled = planInfo.maxMembers > 0;
  const used = allMemories.reduce((t, m) => t + (m.size || 0), 0);
  const available = Math.max(0, planInfo.gb * 1024 ** 3 - used) + (editing ? editing.size || 0 : 0);
  const selectedBytes = assets.reduce((t, a) => t + sizeOf(a), 0);

  const current = assets.length
    ? toMemory(assets[0])
    : editing
    ? { uri: editing.uri, type: editing.type }
    : null;

  const offerUpgrade = (message) =>
    Alert.alert('Plan storage limit', message, [
      { text: 'OK', style: 'cancel' },
      { text: 'View plans', onPress: () => navigation.navigate('Plans') },
    ]);

  const addAssets = (incoming) => {
    incoming = incoming.filter((a) => (a.type === 'video') === (mode === 'video'));
    if (!incoming.length) return;
    const existing = editing ? [] : assets;
    const list = editing
      ? incoming.slice(0, 1)
      : [...existing, ...incoming.filter((n) => !existing.some((e) => e.uri === n.uri))];

    // Keep as many as fit in the plan, in the order they were chosen.
    const fitted = [];
    let total = 0;
    for (const a of list) {
      const sz = sizeOf(a);
      if (total + sz > available) break;
      fitted.push(a);
      total += sz;
    }
    setAssets(fitted);

    if (fitted.length < list.length) {
      offerUpgrade(
        `Only ${fitted.length} of ${list.length} fit in your ${planInfo.name} plan (${formatBytes(available)} left). Upgrade your plan to add more.`
      );
    }
  };

  const pick = async () => {
    if (available <= 0) {
      return offerUpgrade(`Your ${planInfo.name} plan is full. Upgrade your plan or delete some memories to add more.`);
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      quality: 0.8,
      allowsMultipleSelection: !editing,
      selectionLimit: 0,
    });
    if (!r.canceled) addAssets(r.assets);
  };

  const shoot = async () => {
    if (available <= 0) {
      return offerUpgrade(`Your ${planInfo.name} plan is full. Upgrade your plan or delete some memories to add more.`);
    }
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access in your phone settings to take photos.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes, quality: 0.8 });
    if (!r.canceled) addAssets(r.assets);
  };

  const switchMode = (next) => {
    if (next === mode) return;
    if (next === 'video' && !planInfo.videos) {
      return Alert.alert('Videos need a paid plan', `The ${planInfo.name} plan is for photos only. Upgrade to Personal or higher to add videos.`, [
        { text: 'OK', style: 'cancel' },
        { text: 'View plans', onPress: () => navigation.navigate('Plans') },
      ]);
    }
    if (!assets.length) return setMode(next);
    Alert.alert(`Switch to ${next === 'video' ? 'videos' : 'photos'}?`, `Your selected ${noun} will be cleared.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Switch', onPress: () => { setAssets([]); setMode(next); } },
    ]);
  };

  const toggleShare = (on) => {
    setShared(on);
    if (on && !sharedWith.length && members.length) setSharedWith(members.map((m) => m.id));
  };

  const toggleMember = (id) =>
    setSharedWith((list) => {
      if (!list.includes(id)) return [...list, id];
      return list.length > 1 ? list.filter((x) => x !== id) : list; // keep at least one person
    });

  const removeAsset = (uri) => setAssets((list) => list.filter((a) => a.uri !== uri));

  const save = () => {
    if (!current) return Alert.alert(`Add ${mode === 'video' ? 'a video' : 'a photo'}`, `Tap the picture area to choose ${noun}.`);
    if (!title.trim()) return Alert.alert('Title needed', 'Give this memory a title.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
      return Alert.alert('Check the date', 'Use the format YYYY-MM-DD, for example 2024-10-03.');
    }

    const fields = {
      title: title.trim(),
      description: description.trim(),
      date,
      location: location.trim(),
      album: album.trim() || 'Unsorted',
      vault: inVault,
      shared: !inVault && familyEnabled && shared,
      sharedWith: !inVault && familyEnabled && shared ? sharedWith.filter((id) => members.some((m) => m.id === id)) : [],
    };

    if (editing) {
      const changes = { ...fields };
      if (assets.length) {
        changes.type = toMemory(assets[0]).type;
        changes.uri = assets[0].uri;
        changes.size = sizeOf(assets[0]);
      }
      updateMemory(editing.id, changes);
    } else {
      // One memory per chosen file, all sharing the details above.
      [...assets].reverse().forEach((a) => addMemory({ ...fields, ...toMemory(a), size: sizeOf(a) }));
    }
    navigation.goBack();
  };

  const saveLabel = editing ? 'Save Changes' : assets.length > 1 ? `Save ${assets.length} Memories` : 'Save Memory';

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Header title={editing ? 'Edit Memory' : inVault ? 'Add to Vault' : 'Add Memory'} back />
        {!editing && (
          <View style={{ flexDirection: 'row', backgroundColor: '#ECE8F5', borderRadius: 12, padding: 4, marginBottom: 16 }}>
            {[['photo', 'Photos', 'images-outline'], ['video', 'Videos', 'videocam-outline']].map(([k, label, icon]) => (
              <Pressable
                key={k}
                onPress={() => switchMode(k)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 9, backgroundColor: mode === k ? P : 'transparent' }}
              >
                <Ionicons name={k === 'video' && !planInfo.videos ? 'lock-closed' : icon} size={18} color={mode === k ? '#fff' : M} />
                <Text style={{ fontWeight: '800', color: mode === k ? '#fff' : M }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Pressable
          style={[s.preview, !current && { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E4E1EA', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }]}
          onPress={pick}
        >
          {current ? (
            <Thumb m={current} style={s.previewImg} />
          ) : (
            <>
              <Ionicons name="images-outline" size={40} color={M} />
              <Text style={[s.muted, { marginTop: 8 }]}>Tap to choose {noun}</Text>
            </>
          )}
          {assets.length > 1 && (
            <View style={{ position: 'absolute', left: 14, bottom: 14, backgroundColor: 'rgba(16,11,43,.8)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>+{assets.length - 1} more</Text>
            </View>
          )}
          <Pressable style={s.camera} onPress={shoot} hitSlop={6}>
            <Ionicons name="camera" size={20} color="#fff" />
          </Pressable>
        </Pressable>

        {editing ? (
          <Text style={[s.muted, { marginTop: -10, marginBottom: 14 }]}>Tap the picture to replace it.</Text>
        ) : (
          <>
            {assets.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: -6, marginBottom: 10 }}>
                {assets.map((a) => (
                  <View key={a.uri} style={{ marginRight: 10 }}>
                    <Thumb m={toMemory(a)} style={{ width: 64, height: 64, borderRadius: 10 }} />
                    <Pressable onPress={() => removeAsset(a.uri)} hitSlop={6} style={{ position: 'absolute', top: -6, right: -6 }}>
                      <Ionicons name="close-circle" size={22} color="#E5484D" />
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={pick} style={{ width: 64, height: 64, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#DDD8E8', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="add" size={24} color={P} />
                </Pressable>
              </ScrollView>
            )}
            <Text style={[s.muted, { marginBottom: 14 }]}>
              {assets.length > 0 ? `${assets.length} selected · ${formatBytes(selectedBytes)} · ` : ''}
              {formatBytes(Math.max(0, available - selectedBytes))} left on your {planInfo.name} plan
            </Text>
          </>
        )}

        <Field label="Title" placeholder="Family Vacation" value={title} onChangeText={setTitle} />
        <Text style={s.label}>Description</Text>
        <View style={[s.input, { height: 90, alignItems: 'flex-start' }]}>
          <TextInput
            placeholder="Write a short story about this memory..."
            placeholderTextColor="#AAA7B3"
            multiline
            value={description}
            onChangeText={setDescription}
            style={{ flex: 1, textAlignVertical: 'top', paddingTop: 12 }}
          />
        </View>
        <Field label="Date (YYYY-MM-DD)" placeholder="2024-10-03" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
        <Field label="Location" placeholder="Abuja, Nigeria" value={location} onChangeText={setLocation} />
        <Field label="Album" placeholder="Family Trip" value={album} onChangeText={setAlbum} />
        {inVault ? null : familyEnabled ? (
          <View style={{ marginBottom: 14 }}>
            <View style={[s.input, { marginBottom: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="people-outline" size={19} color={M} />
                <Text style={{ color: '#17132D', fontWeight: '700' }}>Share with family</Text>
              </View>
              <Switch value={shared} onValueChange={toggleShare} trackColor={{ true: P }} />
            </View>
            {shared && members.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {members.map((mb) => {
                  const on = sharedWith.includes(mb.id);
                  return (
                    <Pressable key={mb.id} onPress={() => toggleMember(mb.id)} style={[s.chip, on && s.chipA]}>
                      <Text style={on ? { color: '#fff' } : {}}>{mb.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {shared && members.length === 0 && (
              <Text style={s.muted}>Add family members on the Family screen to choose who sees this.</Text>
            )}
          </View>
        ) : (
          <Pressable onPress={() => navigation.navigate('Plans')} style={s.input}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="lock-closed-outline" size={19} color={M} />
              <Text style={{ color: M }}>Share with family · Family plan</Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={M} />
          </Pressable>
        )}
        <Btn onPress={save}>{saveLabel}</Btn>
      </ScrollView>
    </View>
  );
}