import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { s, P, M, Bottom, Btn, Thumb, useBottomSpace } from '../shared';
import { useApp, greeting, initials, formatDate, formatBytes, todayISO, PLANS } from '../store';

const quick = [
  ['Photos', 'images', 'Memories', { tab: 'Photos' }],
  ['Videos', 'videocam', 'Memories', { tab: 'Videos' }],
  ['Stories', 'book', 'Stories'],
  ['Albums', 'folder', 'Memories', { tab: 'Albums' }],
  ['Family', 'people', 'Family'],
  ['Vault', 'lock-closed', 'Vault'],
];

export default function HomeScreen() {
  const bottomSpace = useBottomSpace();
  const n = useNavigation();
  const { user, memories, allMemories, unread, plan } = useApp();
  const [query, setQuery] = useState('');

  const name = user?.name || 'Friend';
  const first = name.split(' ')[0];

  const sorted = useMemo(() => [...memories].sort((a, b) => b.date.localeCompare(a.date)), [memories]);

  const monthDay = todayISO().slice(5);
  const onThisDay = sorted.find((m) => m.date.slice(5) === monthDay);
  const highlight = onThisDay || sorted[0];
  const yearsAgo = highlight ? new Date().getFullYear() - Number(highlight.date.slice(0, 4)) : 0;

  const used = allMemories.reduce((t, m) => t + (m.size || 0), 0);
  const planInfo = PLANS.find((p) => p.id === plan) || PLANS[0];
  const capacity = planInfo.gb * 1024 ** 3;
  const pct = used ? Math.max(1, Math.min(100, Math.round((used / capacity) * 100))) : 0;

  const q = query.trim().toLowerCase();
  const results = q
    ? sorted.filter((m) => [m.title, m.description, m.location, m.album].some((v) => (v || '').toLowerCase().includes(q)))
    : [];

  const open = (m) => n.navigate('MemoryDetail', { id: m.id });

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomSpace }} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={[P, '#2B176E']} style={s.homeTop}>
          <View style={s.greet}>
            <View style={{ flex: 1 }}>
              <Text style={s.white}>{greeting()}, {first} 👋</Text>
              <Text style={s.whiteM}>Your memories are safe.</Text>
            </View>
            <Pressable onPress={() => n.navigate('Notifications')} hitSlop={8} style={{ marginRight: 14 }}>
              <Ionicons name="notifications-outline" size={24} color="#fff" />
              {unread > 0 && (
                <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              )}
            </Pressable>
            <Pressable onPress={() => n.navigate('Profile')}>
              <View style={[s.avatar, { overflow: 'hidden' }]}>
                {user?.photo ? <Image source={{ uri: user.photo }} style={{ width: 42, height: 42 }} /> : <Text style={{ fontWeight: '800', color: P }}>{initials(name)}</Text>}
              </View>
            </Pressable>
          </View>
          <Pressable style={s.storage} onPress={() => n.navigate('Plans')}>
            <View style={s.row}>
              <Text style={s.white}>Storage Usage</Text>
              <Text style={s.white}>{pct}%</Text>
            </View>
            <View style={s.progress}><View style={[s.fill, { width: `${pct}%` }]} /></View>
            <View style={s.row}>
              <Text style={s.whiteM}>{formatBytes(used)} / {planInfo.label} · {planInfo.name} plan</Text>
              <Text style={[s.whiteM, { color: '#FFBF55', fontWeight: '700' }]}>View plans ›</Text>
            </View>
          </Pressable>
        </LinearGradient>

        <View style={{ padding: 20 }}>
          <View style={s.search}>
            <Ionicons name="search" size={19} color={M} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search your memories..."
              placeholderTextColor="#AAA7B3"
              returnKeyType="search"
              style={{ flex: 1, marginLeft: 9 }}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={19} color={M} />
              </Pressable>
            )}
          </View>

          {q ? (
            <>
              <Text style={s.section}>{results.length} {results.length === 1 ? 'result' : 'results'}</Text>
              {results.length === 0 && <Text style={s.muted}>No memories match "{query.trim()}".</Text>}
              {results.map((m) => (
                <Pressable key={m.id} style={s.timeline} onPress={() => open(m)}>
                  <Thumb m={m} style={s.timeImg} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.muted}>{formatDate(m.date)}{m.location ? ` · ${m.location}` : ''}</Text>
                    <Text style={s.card} numberOfLines={1}>{m.title}</Text>
                  </View>
                </Pressable>
              ))}
            </>
          ) : (
            <>
              {memories.length === 0 ? (
                <View style={[s.simpleCard, { alignItems: 'center' }]}>
                  <View style={s.qIcon}><Ionicons name="images-outline" size={22} color={P} /></View>
                  <Text style={[s.card, { marginTop: 10 }]}>No memories yet</Text>
                  <Text style={[s.muted, { marginBottom: 12, textAlign: 'center' }]}>Add your first photo or video to start your collection.</Text>
                  <Btn onPress={() => n.navigate('Add')}>Add a memory</Btn>
                </View>
              ) : (
                <>
                  <Text style={s.section}>{onThisDay ? 'On This Day' : 'Latest Memory'}</Text>
                  <Pressable style={s.onThis} onPress={() => open(highlight)}>
                    <Thumb m={highlight} style={s.onImg} />
                    <View style={{ padding: 12, flex: 1 }}>
                      <Text style={s.card}>{formatDate(highlight.date)}</Text>
                      <Text style={s.muted} numberOfLines={1}>{highlight.title}</Text>
                      {onThisDay && yearsAgo > 0 && <Text style={s.muted}>{yearsAgo} {yearsAgo === 1 ? 'year' : 'years'} ago</Text>}
                      <Text style={s.link}>View memory →</Text>
                    </View>
                  </Pressable>
                </>
              )}

              <Text style={s.section}>Quick Access</Text>
              <View style={s.quickGrid}>
                {quick.map(([x, i, r, params]) => (
                  <Pressable key={x} onPress={() => n.navigate(r, params ? { ...params, t: Date.now() } : undefined)} style={s.quick}>
                    <View style={s.qIcon}><Ionicons name={i} size={21} color={P} /></View>
                    <Text style={s.qText}>{x}</Text>
                  </Pressable>
                ))}
              </View>

              {memories.length > 0 && (
                <>
                  <View style={[s.row, { alignItems: 'center' }]}>
                    <Text style={s.section}>Recent Memories</Text>
                    <Pressable onPress={() => n.navigate('Memories', { tab: 'Photos', t: Date.now() })} hitSlop={8}>
                      <Text style={s.link}>See all</Text>
                    </Pressable>
                  </View>
                  <View style={s.grid}>
                    {sorted.slice(0, 6).map((m) => (
                      <Pressable key={m.id} onPress={() => open(m)}>
                        <Thumb m={m} style={s.gridImg} />
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
      <Bottom active="Home" />
    </View>
  );
}