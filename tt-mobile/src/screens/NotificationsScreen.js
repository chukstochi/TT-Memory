import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { s, P, Header } from '../shared';
import { useApp, formatDate } from '../store';

export default function NotificationsScreen({ navigation }) {
  const { memories, lastSeen, markSeen } = useApp();
  const seenAtOpen = useRef(lastSeen).current;

  useEffect(() => {
    markSeen();
  }, []);

  const added = memories
    .filter((m) => m.createdAt > 0)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Header title="Notifications" back />
        {added.map((m) => (
          <Pressable key={m.id} style={s.simpleCard} onPress={() => navigation.navigate('MemoryDetail', { id: m.id })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={s.qIcon}><Ionicons name="images-outline" size={20} color={P} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.card}>New memory added</Text>
                <Text style={s.muted} numberOfLines={1}>{m.title} · {formatDate(m.date)}</Text>
              </View>
              {m.createdAt > seenAtOpen && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#E5484D' }} />}
            </View>
          </Pressable>
        ))}
        <View style={s.simpleCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={s.qIcon}><Ionicons name="shield-checkmark-outline" size={20} color={P} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.card}>Welcome to TT Memory</Text>
              <Text style={s.muted}>Your memories are safe on this device.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}