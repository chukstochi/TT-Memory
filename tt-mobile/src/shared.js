import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Dimensions, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from './store';

export const W = Dimensions.get('window').width;
export const P = '#100B2B', G = '#FFBF55', BG = '#F8F7FC', M = '#7B7788', T = '#17132D';

export const pics = [
  'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800',
  'https://images.unsplash.com/photo-1504150558240-0b4fd8946624?w=800',
  'https://images.unsplash.com/photo-1494386346843-e12284507169?w=800',
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=800',
  'https://images.unsplash.com/photo-1475503572774-15a45e5d60b9?w=800',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=800',
];

export function Logo({ dark = false }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[s.logo, { backgroundColor: dark ? '#fff' : G }]}>
        <Text style={s.logoT}>T</Text>
        <Text style={[s.logoT, { marginLeft: -7 }]}>T</Text>
      </View>
      <Text style={[s.logoName, { color: dark ? '#fff' : P }]}>Memory</Text>
    </View>
  );
}

export function Btn({ children, onPress, outline = false, style }) {
  return (
    <Pressable onPress={onPress} style={[s.btn, outline && s.btnOutline, style]}>
      <Text style={[s.btnText, outline && { color: P }]}>{children}</Text>
    </Pressable>
  );
}

export function Field({ label, placeholder, pass = false, value, onChangeText, keyboardType }) {
  const [hidden, setHidden] = useState(pass);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.input}>
        <TextInput
          placeholder={placeholder}
          placeholderTextColor="#AAA7B3"
          secureTextEntry={hidden}
          autoCapitalize="none"
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          style={{ flex: 1 }}
        />
        {pass && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={19} color={M} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// Replace these with your own app's store links when TT Memory is published.
const APP_STORE_URL = 'https://apps.apple.com/';
const PLAY_STORE_URL = 'https://play.google.com/store';
const openLink = (url) => Linking.openURL(url).catch(() => {});

export function SocialRow({ onEmailPress }) {
  return (
    <>
      <Pressable onPress={onEmailPress} hitSlop={8}>
        <Text style={s.or}>Or continue with</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn outline style={{ flex: 1 }} onPress={() => openLink(PLAY_STORE_URL)}>G  Google</Btn>
        <Btn outline style={{ flex: 1 }} onPress={() => openLink(APP_STORE_URL)}>Apple</Btn>
      </View>
    </>
  );
}

export function Header({ title, sub, back = false }) {
  const n = useNavigation();
  const { unread } = useApp();
  return (
    <View style={s.header}>
      {back && (
        <Pressable onPress={() => n.goBack()}>
          <Ionicons name="chevron-back" size={25} color={T} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.h1}>{title}</Text>
        {sub && <Text style={s.sub}>{sub}</Text>}
      </View>
      <Pressable onPress={() => n.navigate('Notifications')} hitSlop={10}>
        <Ionicons name="notifications-outline" size={24} color={T} />
        {unread > 0 && (
          <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

// Room to leave under scrolling content so nothing hides behind the bottom menu.
export const useBottomSpace = () => 76 + useSafeAreaInsets().bottom + 24;

export function Bottom({ active }) {
  const n = useNavigation();
  const inset = useSafeAreaInsets().bottom; // keeps the bar above the phone's own back/home buttons
  return (
    <View style={[s.bottom, { height: 76 + inset, paddingBottom: 8 + inset }]}>
      {[['Home', 'home-outline'], ['Memories', 'images-outline'], ['Add', 'add'], ['Family', 'people-outline'], ['More', 'menu-outline']].map(([x, i]) =>
        x === 'Add' ? (
          <Pressable key={x} onPress={() => n.navigate('Add')} style={s.plus}>
            <Ionicons name="add" size={29} color="#fff" />
          </Pressable>
        ) : (
          <Pressable key={x} onPress={() => (x === 'More' ? n.navigate('Profile') : n.navigate(x))} style={s.nav}>
            <Ionicons name={i} size={21} color={active === x ? P : '#A4A1AF'} />
            <Text style={[s.navText, active === x && { color: P, fontWeight: '700' }]}>{x}</Text>
          </Pressable>
        )
      )}
    </View>
  );
}

export function Thumb({ m, style }) {
  if (m.type === 'video') {
    return (
      <View style={[{ backgroundColor: '#2B176E', alignItems: 'center', justifyContent: 'center' }, style]}>
        <Ionicons name="play-circle" size={34} color="#fff" />
      </View>
    );
  }
  return <Image source={{ uri: m.uri }} style={style} />;
}

export function UpgradeCard({ icon, badge, title, text, perks = [], price, cta, note, onPress }) {
  return (
    <LinearGradient colors={[P, '#2B176E']} style={{ borderRadius: 24, padding: 22, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,191,85,.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={28} color={G} />
        </View>
        {!!badge && (
          <View style={{ backgroundColor: G, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 10, fontWeight: '900', color: P, letterSpacing: 0.6 }}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 28, marginTop: 18 }}>{title}</Text>
      {!!text && <Text style={{ color: '#C9C4D8', fontSize: 14, lineHeight: 21, marginTop: 8 }}>{text}</Text>}
      <View style={{ marginTop: 18, gap: 12 }}>
        {perks.map((p) => (
          <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="checkmark-circle" size={20} color={G} />
            <Text style={{ color: '#fff', fontSize: 14, flex: 1 }}>{p}</Text>
          </View>
        ))}
      </View>
      {!!price && <Text style={{ color: G, fontSize: 15, fontWeight: '800', marginTop: 20 }}>{price}</Text>}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          { marginTop: price ? 12 : 22, height: 54, borderRadius: 14, backgroundColor: G, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={{ color: P, fontWeight: '900', fontSize: 16 }}>{cta}</Text>
        <Ionicons name="arrow-forward" size={18} color={P} />
      </Pressable>
      {!!note && <Text style={{ color: '#9B96B0', textAlign: 'center', fontSize: 12, marginTop: 12 }}>{note}</Text>}
    </LinearGradient>
  );
}

export const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: BG }, dark: { flex: 1 }, logo: { width: 42, height: 27, borderRadius: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, logoT: { fontSize: 25, fontWeight: '900', color: P }, logoName: { fontSize: 27, fontWeight: '800' }, hero: { height: 285, marginTop: 25, alignItems: 'center', justifyContent: 'center' }, heroImg: { width: 245, height: 250, borderRadius: 28, transform: [{ rotate: '-5deg' }] }, floatImg: { position: 'absolute', right: 38, bottom: 5, width: 105, height: 112, borderRadius: 16, borderWidth: 6, borderColor: '#fff', transform: [{ rotate: '8deg' }] }, darkTitle: { fontSize: 34, fontWeight: '800', color: '#fff', lineHeight: 39 }, darkSub: { color: '#D4D0DF', fontSize: 15, lineHeight: 22, marginTop: 12 }, dots: { flexDirection: 'row', gap: 6, marginVertical: 22 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#625C7B' }, dotA: { width: 25, height: 7, borderRadius: 4, backgroundColor: G }, btn: { height: 50, borderRadius: 12, backgroundColor: P, alignItems: 'center', justifyContent: 'center' }, btnOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2DFEA' }, btnText: { color: '#fff', fontWeight: '800', fontSize: 15 }, bottomLink: { textAlign: 'center', color: '#D4D0DF', marginTop: 18 }, auth: { padding: 28, paddingTop: 65 }, authTitle: { fontSize: 27, fontWeight: '800', color: T, textAlign: 'center', marginTop: 35 }, authSub: { textAlign: 'center', color: M, marginTop: 7, marginBottom: 25 }, label: { fontSize: 12, fontWeight: '700', color: '#575363', marginBottom: 7 }, input: { height: 50, borderWidth: 1, borderColor: '#E4E1EA', borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, or: { textAlign: 'center', color: M, marginVertical: 18 }, rem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16 }, h1: { fontSize: 25, fontWeight: '800', color: T }, sub: { color: M, marginTop: 2 }, homeTop: { padding: 22, paddingTop: 58, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }, greet: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, white: { color: '#fff', fontSize: 16, fontWeight: '700' }, whiteM: { color: '#C9C4D8', fontSize: 12, marginTop: 5 }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: G, alignItems: 'center', justifyContent: 'center' }, storage: { backgroundColor: 'rgba(255,255,255,.1)', borderRadius: 14, padding: 14, marginTop: 25 }, row: { flexDirection: 'row', justifyContent: 'space-between' }, progress: { height: 7, backgroundColor: '#544A7B', borderRadius: 5, marginVertical: 9, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: G, borderRadius: 5 }, search: { height: 48, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E9E6EF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 18 }, searchText: { color: '#AAA7B3', marginLeft: 9 }, section: { fontSize: 17, fontWeight: '800', color: T, marginTop: 18, marginBottom: 12 }, onThis: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', flexDirection: 'row', borderWidth: 1, borderColor: '#ECE9F1' }, onImg: { width: 110, height: 115 }, card: { fontSize: 14, fontWeight: '800', color: T }, muted: { fontSize: 12, color: M, marginTop: 4 }, link: { color: P, fontWeight: '700', fontSize: 13, marginTop: 8 }, quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, quick: { width: (W - 64) / 3, alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 14 }, qIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#F0ECFF', alignItems: 'center', justifyContent: 'center' }, qText: { fontSize: 12, fontWeight: '700', marginTop: 7, color: T }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, gridImg: { width: (W - 54) / 3, height: 112, borderRadius: 11 }, bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 76, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#E9E6EF', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 8 }, nav: { alignItems: 'center', minWidth: 55 }, navText: { fontSize: 9, color: '#A4A1AF', marginTop: 3 }, plus: { width: 53, height: 53, borderRadius: 27, backgroundColor: P, alignItems: 'center', justifyContent: 'center', marginTop: -28, borderWidth: 5, borderColor: BG }, tabs: { flexDirection: 'row', gap: 20, marginBottom: 15 }, tab: { color: M, fontSize: 13 }, tabA: { color: P, fontWeight: '800', fontSize: 13 }, chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginBottom: 5 }, chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6E2ED' }, chipA: { backgroundColor: P, borderColor: P }, memImg: { width: (W - 24) / 3, height: (W - 24) / 3, margin: 2, borderRadius: 8 }, preview: { height: 245, borderRadius: 18, overflow: 'hidden', marginBottom: 20 }, previewImg: { width: '100%', height: '100%' }, camera: { position: 'absolute', right: 14, bottom: 14, width: 43, height: 43, borderRadius: 22, backgroundColor: P, alignItems: 'center', justifyContent: 'center' }, members: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 15 }, member: { width: 55, height: 55, borderRadius: 28, backgroundColor: '#E9D5FF', alignItems: 'center', justifyContent: 'center' }, small: { fontSize: 11, marginTop: 5 }, addMember: { width: 55, height: 55, borderRadius: 28, borderWidth: 1, borderColor: '#DDD8E8', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }, albumRow: { flexDirection: 'row', gap: 10 }, album: { backgroundColor: '#fff', padding: 8, borderRadius: 14, width: (W - 55) / 3 }, albumImg: { width: '100%', height: 92, borderRadius: 10 }, timeline: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', padding: 10, borderRadius: 12, marginBottom: 8 }, timeImg: { width: 54, height: 54, borderRadius: 9 }, story: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }, storyImg: { width: '100%', height: 200 }, storyText: { fontSize: 13, color: M, lineHeight: 19, marginTop: 8 }, storyFoot: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 13 }, vault: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 70 }, vTitle: { fontSize: 28, color: '#fff', fontWeight: '800', marginTop: 10 }, vSub: { color: '#C9C4D8', textAlign: 'center', lineHeight: 20 }, pin: { flexDirection: 'row', gap: 12, marginVertical: 25 }, keys: { width: 260, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }, key: { width: 70, height: 58, borderRadius: 30, backgroundColor: 'rgba(255,255,255,.08)', alignItems: 'center', justifyContent: 'center' }, simpleCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#ECE9F1' } });