import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { s, M, Header, Bottom, Thumb, UpgradeCard, useBottomSpace } from '../shared';
import { useApp, formatDate, PLANS } from '../store';

const TABS = ['Photos', 'Videos', 'Albums', 'Timeline'];

export default function MemoriesScreen({ route }) {
  const bottomSpace = useBottomSpace();
  const n = useNavigation();
  const { memories, plan } = useApp();
  const [tab, setTab] = useState(route.params?.tab || 'Photos');
  const [album, setAlbum] = useState(route.params?.album || null);
  const onlyShared = !!route.params?.shared;
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (route.params?.tab) {
      setTab(route.params.tab);
      setAlbum(route.params.album || null);
    }
  }, [route.params?.tab, route.params?.t]);

  const q = query.trim().toLowerCase();
  const base = useMemo(() => {
    const sorted = [...(onlyShared ? memories.filter((m) => m.shared) : memories)].sort((a, b) => b.date.localeCompare(a.date));
    if (!q) return sorted;
    return sorted.filter((m) => [m.title, m.description, m.location, m.album].some((v) => (v || '').toLowerCase().includes(q)));
  }, [memories, q, onlyShared]);

  const albums = useMemo(() => {
    const map = {};
    base.forEach((m) => {
      const k = m.album || 'Unsorted';
      (map[k] = map[k] || []).push(m);
    });
    return Object.entries(map).map(([name, items]) => ({ name, items }));
  }, [base]);

  const open = (m) => n.navigate('MemoryDetail', { id: m.id });
  const empty = <Text style={[s.muted, { textAlign: 'center', marginTop: 30 }]}>Nothing here yet.</Text>;

  const grid = (items) => (
    <FlatList
      key={`grid-${tab}-${album}`}
      data={items}
      numColumns={3}
      keyExtractor={(m) => m.id}
      contentContainerStyle={{ padding: 8, paddingBottom: bottomSpace }}
      ListEmptyComponent={empty}
      renderItem={({ item }) => (
        <Pressable onPress={() => open(item)}>
          <Thumb m={item} style={s.memImg} />
        </Pressable>
      )}
    />
  );

  let body;
  if (tab === 'Photos') {
    body = grid(base.filter((m) => m.type !== 'video'));
  } else if (tab === 'Videos') {
    const videosOn = (PLANS.find((p) => p.id === plan) || PLANS[0]).videos;
    body = videosOn ? (
      grid(base.filter((m) => m.type === 'video'))
    ) : (
      <View style={{ padding: 20 }}>
        <UpgradeCard
          icon="videocam"
          badge="PERSONAL PLAN"
          title="Videos need a paid plan"
          text="The Free plan is for photos only. Upgrade to add and watch your videos."
          perks={['Upload and watch videos', 'Automatic backup', '100 GB of storage']}
          price="From ₦1,000/month"
          cta="See plans"
          onPress={() => n.navigate('Plans')}
        />
      </View>
    );
  } else if (tab === 'Albums') {
    if (album) {
      const items = (albums.find((a) => a.name === album) || { items: [] }).items;
      body = (
        <>
          <Pressable onPress={() => setAlbum(null)} style={{ paddingHorizontal: 20, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="chevron-back" size={18} color={M} />
            <Text style={s.card}>{album}</Text>
          </Pressable>
          {grid(items)}
        </>
      );
    } else {
      body = (
        <FlatList
          key="albums"
          data={albums}
          keyExtractor={(a) => a.name}
          contentContainerStyle={{ padding: 20, paddingTop: 5, paddingBottom: bottomSpace }}
          ListEmptyComponent={empty}
          renderItem={({ item }) => (
            <Pressable style={s.timeline} onPress={() => setAlbum(item.name)}>
              <Thumb m={item.items[0]} style={s.timeImg} />
              <View style={{ flex: 1 }}>
                <Text style={s.card}>{item.name}</Text>
                <Text style={s.muted}>{item.items.length} {item.items.length === 1 ? 'item' : 'items'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={M} />
            </Pressable>
          )}
        />
      );
    }
  } else {
    body = (
      <FlatList
        key="timeline"
        data={base}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 20, paddingTop: 5, paddingBottom: bottomSpace }}
        ListEmptyComponent={empty}
        renderItem={({ item }) => (
          <Pressable style={s.timeline} onPress={() => open(item)}>
            <Thumb m={item} style={s.timeImg} />
            <View style={{ flex: 1 }}>
              <Text style={s.muted}>{formatDate(item.date)}</Text>
              <Text style={s.card} numberOfLines={1}>{item.title}</Text>
            </View>
          </Pressable>
        )}
      />
    );
  }

  return (
    <View style={s.screen}>
      <View style={{ padding: 20, paddingBottom: 5 }}>
        <Header title={onlyShared ? 'Family Memories' : 'Memories'} back={onlyShared} />
        <View style={s.tabs}>
          {TABS.map((t) => (
            <Pressable key={t} onPress={() => { setTab(t); setAlbum(null); }} hitSlop={6}>
              <Text style={tab === t ? s.tabA : s.tab}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.search}>
          <Ionicons name="search" size={19} color={M} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search memories..."
            placeholderTextColor="#AAA7B3"
            style={{ flex: 1, marginLeft: 9 }}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={19} color={M} />
            </Pressable>
          )}
        </View>
      </View>
      {body}
      <Bottom active="Memories" />
    </View>
  );
}