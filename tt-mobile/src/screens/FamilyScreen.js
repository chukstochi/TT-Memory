import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal, Alert, Share, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { s, P, G, M, T, Header, Bottom, Btn, Field, Thumb, UpgradeCard, useBottomSpace } from '../shared';
import { useApp, PLANS, formatDate } from '../store';

const COLORS = ['#E9D5FF', '#FFE3B3', '#CDE9FF', '#D3F5E3', '#FFD6D6'];
const RELATIONS = ['Mum', 'Dad', 'Spouse', 'Brother', 'Sister', 'Child', 'Aunty', 'Uncle', 'Grandparent', 'Other'];
const initial = (n) => ((n || '?').trim()[0] || '?').toUpperCase();

function MemberModal({ visible, member, onClose, onSave, onRemove }) {
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [contact, setContact] = useState('');

  useEffect(() => {
    if (visible) {
      setName(member?.name || '');
      setRelation(member?.relation || '');
      setContact(member?.contact || '');
    }
  }, [visible, member]);

  const submit = () => {
    if (!name.trim()) return Alert.alert('Name needed', "Enter the family member's name.");
    onSave({ name: name.trim(), relation: relation.trim(), contact: contact.trim() });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)' }} onPress={onClose} />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 30, maxHeight: '88%' }}>
          <View style={{ alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#DDD8E8', marginBottom: 14 }} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: T, marginBottom: 14 }}>
              {member ? 'Edit family member' : 'Add family member'}
            </Text>
            <Field label="Name" placeholder="Enter their name" value={name} onChangeText={setName} />
            <Text style={s.label}>Relationship</Text>
            <View style={[s.chips, { marginBottom: 10 }]}>
              {RELATIONS.map((r) => (
                <Pressable key={r} onPress={() => setRelation(r)} style={[s.chip, relation === r && s.chipA]}>
                  <Text style={relation === r ? { color: '#fff' } : {}}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <Field placeholder="Or type your own" value={relation} onChangeText={setRelation} />
            <Field label="Email or phone (optional)" placeholder="name@example.com" value={contact} onChangeText={setContact} keyboardType="email-address" />
            <Btn onPress={submit}>{member ? 'Save Changes' : 'Add Member'}</Btn>
            {member && (
              <View style={{ marginTop: 12 }}>
                <Btn outline onPress={onRemove}>Remove member</Btn>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function FamilyScreen() {
  const bottomSpace = useBottomSpace();
  const n = useNavigation();
  const { plan, members, memories, addMember, updateMember, removeMember } = useApp();
  const [modal, setModal] = useState({ visible: false, member: null });

  const planInfo = PLANS.find((p) => p.id === plan) || PLANS[0];
  const max = planInfo.maxMembers;

  const shared = useMemo(
    () => memories.filter((m) => m.shared).sort((a, b) => b.date.localeCompare(a.date)),
    [memories]
  );
  const albums = useMemo(() => {
    const map = {};
    shared.forEach((m) => {
      const k = m.album || 'Unsorted';
      (map[k] = map[k] || []).push(m);
    });
    return Object.entries(map).map(([name, items]) => ({ name, items }));
  }, [shared]);

  const namesFor = (m) =>
    (m.sharedWith || []).map((id) => members.find((x) => x.id === id)?.name).filter(Boolean).join(', ');

  if (max === 0) {
    return (
      <View style={s.screen}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: bottomSpace }}>
          <Header title="Family" sub="Together, always." />
          <UpgradeCard
            icon="people"
            badge="FAMILY PLAN"
            title="Keep your family's memories together"
            text="Invite the people you love, share albums and build a timeline everyone can see."
            perks={['Add up to 5 family members', 'Shared albums for the whole family', 'A family timeline in date order', 'Choose who sees each memory']}
            price="From ₦3,000/month"
            cta="See Family plans"
            note={`You're on the ${planInfo.name} plan`}
            onPress={() => n.navigate('Plans')}
          />
          <Text style={s.section}>Your family circle</Text>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[s.addMember, { opacity: 1 - i * 0.18 }]}>
                <Ionicons name={i === 0 ? 'lock-closed' : 'person-add-outline'} size={20} color={M} />
              </View>
            ))}
          </View>
          <Text style={[s.muted, { marginTop: 10 }]}>Your members will appear here once you join a Family plan.</Text>
        </ScrollView>
        <Bottom active="Family" />
      </View>
    );
  }

  const openAdd = () => {
    if (members.length >= max) {
      const top = plan === 'family-plus';
      return Alert.alert(
        'Member limit reached',
        top
          ? `The ${planInfo.name} plan allows up to ${max} family members.`
          : `The ${planInfo.name} plan allows up to ${max} family members. Upgrade to add more.`,
        top ? [{ text: 'OK' }] : [{ text: 'OK', style: 'cancel' }, { text: 'View plans', onPress: () => n.navigate('Plans') }]
      );
    }
    setModal({ visible: true, member: null });
  };

  const close = () => setModal({ visible: false, member: null });

  const save = (data) => {
    if (modal.member) updateMember(modal.member.id, data);
    else addMember(data);
    close();
  };

  const remove = () => {
    const m = modal.member;
    Alert.alert('Remove member?', `${m.name} will be removed from your family. Memories shared with them stay in your timeline.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { removeMember(m.id); close(); } },
    ]);
  };

  const invite = async () => {
    try {
      await Share.share({ message: "I'm keeping our family memories safe on TT Memory. Join me so we can share them together!" });
    } catch {}
  };

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: bottomSpace }}>
        <Header title="Family" sub="Together, always." />

        <View style={[s.row, { alignItems: 'center' }]}>
          <Text style={s.section}>Members</Text>
          <Text style={s.muted}>{members.length} of {max}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 6 }}>
          {members.map((m, i) => (
            <Pressable key={m.id} style={{ alignItems: 'center', width: 64 }} onPress={() => setModal({ visible: true, member: m })}>
              <View style={[s.member, { backgroundColor: COLORS[i % COLORS.length] }]}>
                <Text style={{ fontWeight: '800', color: P }}>{initial(m.name)}</Text>
              </View>
              <Text style={s.small} numberOfLines={1}>{m.name}</Text>
              {!!m.relation && <Text style={[s.muted, { marginTop: 0, fontSize: 10 }]} numberOfLines={1}>{m.relation}</Text>}
            </Pressable>
          ))}
          <Pressable style={{ alignItems: 'center', width: 64 }} onPress={openAdd}>
            <View style={s.addMember}><Ionicons name="add" size={23} color={P} /></View>
            <Text style={s.small}>Add</Text>
          </Pressable>
        </View>
        {members.length === 0 && <Text style={[s.muted, { marginBottom: 8 }]}>No family members yet. Tap + to add the first one.</Text>}
        <View style={{ marginTop: 10 }}>
          <Btn outline onPress={invite}>Invite family</Btn>
        </View>

        <Text style={s.section}>Shared Albums</Text>
        {albums.length === 0 ? (
          <Text style={s.muted}>Nothing shared yet. Turn on "Share with family" when you add or edit a memory.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {albums.map((a) => (
              <Pressable
                key={a.name}
                style={[s.album, { marginRight: 10 }]}
                onPress={() => n.navigate('Memories', { tab: 'Albums', album: a.name, shared: true, t: Date.now() })}
              >
                <Thumb m={a.items[0]} style={s.albumImg} />
                <Text style={s.card} numberOfLines={1}>{a.name}</Text>
                <Text style={s.muted}>{a.items.length} {a.items.length === 1 ? 'item' : 'items'}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Text style={s.section}>Family Timeline</Text>
        {shared.length === 0 ? (
          <Text style={s.muted}>Shared memories will appear here in date order.</Text>
        ) : (
          shared.slice(0, 20).map((m) => (
            <Pressable key={m.id} style={s.timeline} onPress={() => n.navigate('MemoryDetail', { id: m.id })}>
              <Thumb m={m} style={s.timeImg} />
              <View style={{ flex: 1 }}>
                <Text style={s.muted}>{formatDate(m.date)}{namesFor(m) ? ` · ${namesFor(m)}` : ''}</Text>
                <Text style={s.card} numberOfLines={1}>{m.title}</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
      <Bottom active="Family" />
      <MemberModal visible={modal.visible} member={modal.member} onClose={close} onSave={save} onRemove={remove} />
    </View>
  );
}