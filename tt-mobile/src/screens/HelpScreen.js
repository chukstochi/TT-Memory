import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { s, P, M, Header, Btn } from '../shared';

// Replace with your real support address before you publish the app.
const SUPPORT_EMAIL = 'support@example.com';

const FAQ = [
  ['Where are my memories stored?', 'On this phone, inside the app. There is no online backup yet, so if you delete the app or clear its data your memories are lost.'],
  ['How do I add several photos at once?', 'Tap the + button, choose Photos or Videos, then tap the picture area and select as many as you like. How many fit depends on your plan.'],
  ['How does the Vault work?', 'Open Vault from Home, create a 4-digit PIN, then use Move to Vault on any memory. Vault memories are hidden from your library, search and family sharing.'],
  ['I forgot my Vault PIN.', 'Tap Forgot PIN on the Vault screen. Your phone will ask for its own screen lock, and then you can set a new PIN. Your vault memories are kept.'],
  ['How does family sharing work?', 'On a Family or Family Plus plan, add members on the Family screen and turn on Share with family when you add or edit a memory. Sharing is organised on this phone only for now.'],
  ['Can I change my plan?', 'Yes. Tap Storage Usage on Home, or Change on your profile. Payments are not set up yet, so changing plan only changes your limit on this phone.'],
];

export default function HelpScreen() {
  const [open, setOpen] = useState(null);

  const contact = () =>
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('TT Memory help')}`).catch(() =>
      Alert.alert('No email app', `Write to us at ${SUPPORT_EMAIL}`)
    );

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Header title="Help & Support" sub="Answers to common questions" back />
        {FAQ.map(([q, a], i) => (
          <Pressable key={q} style={s.simpleCard} onPress={() => setOpen(open === i ? null : i)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[s.card, { flex: 1, fontSize: 15 }]}>{q}</Text>
              <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={M} />
            </View>
            {open === i && <Text style={[s.storyText, { marginTop: 10 }]}>{a}</Text>}
          </Pressable>
        ))}
        <View style={{ marginTop: 8 }}>
          <Btn onPress={contact}>Contact support</Btn>
        </View>
      </ScrollView>
    </View>
  );
}