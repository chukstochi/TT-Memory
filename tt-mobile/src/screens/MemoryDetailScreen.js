import React from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { s, M, P, Header, Btn, Thumb } from '../shared';
import { useApp, formatDate, formatBytes } from '../store';

function Info({ icon, text }) {
  if (!text) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
      <Ionicons name={icon} size={18} color={M} />
      <Text style={{ color: '#575363', flex: 1 }}>{text}</Text>
    </View>
  );
}

export default function MemoryDetailScreen({ route, navigation }) {
  const { allMemories, deleteMemory, updateMemory, members } = useApp();
  const m = allMemories.find((x) => x.id === route.params?.id);

  if (!m) {
    return (
      <View style={s.screen}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Header title="Memory" back />
          <Text style={s.muted}>This memory no longer exists.</Text>
        </ScrollView>
      </View>
    );
  }

  const confirmDelete = () =>
    Alert.alert('Delete memory?', `"${m.title}" will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteMemory(m.id);
          navigation.goBack();
        },
      },
    ]);

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Header title="Memory" back />
        <Thumb m={m} style={{ width: '100%', height: 300, borderRadius: 18 }} />
        <Text style={[s.h1, { marginTop: 18 }]}>{m.title}</Text>
        <Info icon="calendar-outline" text={formatDate(m.date)} />
        <Info icon="location-outline" text={m.location} />
        <Info icon="folder-outline" text={m.album} />
        {m.vault && <Info icon="lock-closed-outline" text="In your Vault" />}
        {m.shared && (
          <Info
            icon="people-outline"
            text={(() => {
              const names = (m.sharedWith || []).map((id) => members.find((x) => x.id === id)?.name).filter(Boolean).join(', ');
              return names ? `Shared with family: ${names}` : 'Shared with family';
            })()}
          />
        )}
        {m.size > 0 && <Info icon="cloud-outline" text={formatBytes(m.size)} />}
        {!!m.description && <Text style={[s.storyText, { marginTop: 16, marginBottom: 20 }]}>{m.description}</Text>}
        <View style={{ marginTop: m.description ? 0 : 20, gap: 12 }}>
          <Btn onPress={() => navigation.navigate('Add', { id: m.id })}>Edit memory</Btn>
          <Btn
            outline
            onPress={() =>
              Alert.alert(
                m.vault ? 'Move out of Vault?' : 'Move to Vault?',
                m.vault
                  ? 'It will show up in your library again.'
                  : 'It will be hidden from your library, search and family sharing until you move it out.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Move',
                    onPress: () => {
                      updateMemory(m.id, m.vault ? { vault: false } : { vault: true, shared: false, sharedWith: [] });
                      navigation.goBack();
                    },
                  },
                ]
              )
            }
          >
            {m.vault ? 'Move out of Vault' : 'Move to Vault'}
          </Btn>
          <Btn outline onPress={confirmDelete}>Delete memory</Btn>
        </View>
      </ScrollView>
    </View>
  );
}