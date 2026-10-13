import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useNavigation } from '@react-navigation/native';
import { s, P, G, M, T, Header, Bottom, useBottomSpace } from '../shared';
import { useApp, PLANS, formatBytes, initials } from '../store';
import { clearPending } from '../payments/token';
import { clearToken } from '../session';
import { logoutRequest, deleteAccountRequest, changePassword } from '../api';
import PasswordPrompt from '../PasswordPrompt';
import { requestSync } from '../cloud/sync';
import { needsBackup } from '../cloud/merge';
import { keyFor } from '../accountKey';
import { loadEmails } from '../EmailPicker';

const APP_VERSION = '1.0.0';

function Section({ title, children }) {
  return (
    <>
      <Text style={s.section}>{title}</Text>
      <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#ECE9F1', overflow: 'hidden' }}>{children}</View>
    </>
  );
}

function Row({ icon, label, sub, onPress, right, last, danger }) {
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: last ? 0 : 1, borderColor: '#F0EDF5' }}>
      <View style={[s.qIcon, { width: 38, height: 38 }, danger && { backgroundColor: '#FDECEC' }]}>
        <Ionicons name={icon} size={19} color={danger ? '#D64545' : P} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.card, { fontSize: 15 }, danger && { color: '#D64545' }]}>{label}</Text>
        {!!sub && <Text style={s.muted}>{sub}</Text>}
      </View>
      {right !== undefined ? right : onPress ? <Ionicons name="chevron-forward" size={18} color={M} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export default function ProfileScreen() {
  const bottomSpace = useBottomSpace();
  const nav = useNavigation();
  const [prompt, setPrompt] = useState(null); // 'delete' | 'password' | null
  const { user, plan, subscription, allMemories, members, settings, updateSettings, signOut, deleteAccount: removeAccount, cloud, deletedIds } = useApp();

  const name = user?.name || 'Friend';
  const planInfo = PLANS.find((p) => p.id === plan) || PLANS[0];
  const used = allMemories.reduce((t, m) => t + (m.size || 0), 0);
  const pct = used ? Math.max(1, Math.min(100, Math.round((used / (planInfo.gb * 1024 ** 3)) * 100))) : 0;

  const waiting = allMemories.filter((m) => needsBackup(m)).length + (deletedIds || []).length;
  const failed = allMemories.filter((m) => m.syncError).length;
  const backupSub =
    cloud.status === 'syncing' ? 'Backing up…'
    : cloud.status === 'offline' ? 'No connection. Will retry when you are online.'
    : cloud.status === 'wifi' ? `${waiting} waiting for Wi-Fi`
    : failed ? `${failed} could not be backed up. Tap to see why and retry.`
    : cloud.status === 'error' && cloud.error ? cloud.error
    : waiting ? `${waiting} waiting to back up`
    : cloud.lastSync ? `All backed up · ${formatBytes(cloud.used)} of ${formatBytes(cloud.limit)} used in the cloud`
    : 'Tap to back up now';
  const backupNow = () => {
    const bad = allMemories.find((m) => m.syncError);
    if (bad) Alert.alert('Could not back up', `${bad.syncError}\n\nTap Retry after you have fixed this, for example by upgrading your plan.`, [
      { text: 'Close', style: 'cancel' },
      { text: 'View plans', onPress: () => nav.navigate('Plans') },
      { text: 'Retry', onPress: () => requestSync(true) },
    ]);
    else requestSync(true);
  };

  const toOnboarding = () => nav.reset({ index: 0, routes: [{ name: 'Onboarding' }] });

  const logOut = () =>
    Alert.alert('Log out?', 'Your memories stay on this phone. Log back in with the same email to see them.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        onPress: async () => {
          try { await logoutRequest(); } catch {}
          await clearToken();
          signOut();
          toOnboarding();
        },
      },
    ]);

  const deleteAccount = () => {
    if (plan !== 'free' && !(subscription && subscription.cancelAtPeriodEnd)) {
      return Alert.alert(
        'Cancel your subscription first',
        'You have an active paid plan. Cancel it in Billing first so you are not charged again, then you can delete your account.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Billing', onPress: () => nav.navigate('Billing') },
        ]
      );
    }
    Alert.alert(
      'Delete your account?',
      'If you continue, the following will be permanently erased and cannot be recovered:\n\n• All your photos and videos\n• Everything in your Vault\n• Your family members and settings\n• Your profile and login\n\nYour memories are not backed up anywhere else. Are you sure you want to delete your account?',
      [
        { text: 'No, keep my account', style: 'cancel' },
        { text: 'Yes, delete it', style: 'destructive', onPress: () => setPrompt('delete') },
      ]
    );
  };

  const finishDelete = async ({ password }) => {
    await deleteAccountRequest(password || ''); // the server checks the password and ends the account
    try {
      const list = await loadEmails();
      await AsyncStorage.setItem('tt_saved_emails', JSON.stringify(list.filter((x) => x !== user.email)));
      await SecureStore.deleteItemAsync(keyFor('tt_vault_pin', user.email));
      await SecureStore.deleteItemAsync(keyFor('tt_vault_bio', user.email));
      await clearPending();
    } catch {}
    await clearToken();
    setPrompt(null);
    removeAccount();
    toOnboarding();
  };

  const finishPassword = async ({ current, password }) => {
    if (!current) throw new Error('Enter your current password.');
    if (!password || password.length < 8) throw new Error('Use a new password of at least 8 characters.');
    await changePassword({ current, password });
    setPrompt(null);
    Alert.alert('Password changed', 'Other devices were logged out.');
  };

  const devices = () =>
    Alert.alert(
      'Connected devices',
      `This phone (${Platform.OS === 'ios' ? 'iPhone' : 'Android'}) is the only device. Your memories are stored on it. Using TT Memory on more than one device needs an online account, which is not set up yet.`
    );

  const toggle = (key) => (v) => updateSettings({ [key]: v });
  const sw = (key) => <Switch value={settings[key]} onValueChange={toggle(key)} trackColor={{ true: P }} />;

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: bottomSpace }}>
        <Header title="Profile & Settings" />

        <View style={{ alignItems: 'center', marginBottom: 6 }}>
          <View style={[s.avatar, { width: 84, height: 84, borderRadius: 42, overflow: 'hidden' }]}>
            {user?.photo ? (
              <Image source={{ uri: user.photo }} style={{ width: 84, height: 84 }} />
            ) : (
              <Text style={{ fontSize: 28, fontWeight: '800', color: P }}>{initials(name)}</Text>
            )}
          </View>
          <Text style={[s.h1, { marginTop: 12 }]}>{name}</Text>
          <Text style={s.muted}>{user?.email}</Text>
          <Pressable onPress={() => nav.navigate('EditProfile')} style={{ marginTop: 12, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: '#E2DFEA', backgroundColor: '#fff' }}>
            <Text style={{ fontWeight: '800', color: P }}>Edit profile</Text>
          </Pressable>
        </View>

        <Pressable style={[s.storage, { backgroundColor: P, marginTop: 20 }]} onPress={() => nav.navigate('Plans')}>
          <View style={s.row}>
            <Text style={s.white}>{planInfo.name} plan</Text>
            <Text style={[s.whiteM, { color: G, fontWeight: '700', marginTop: 0 }]}>Change ›</Text>
          </View>
          <View style={s.progress}><View style={[s.fill, { width: `${pct}%` }]} /></View>
          <Text style={s.whiteM}>{formatBytes(used)} of {planInfo.label} used · {allMemories.length} memories</Text>
        </Pressable>

        <Section title="Account">
          <Row icon="person-outline" label="Account information" sub={user?.phone ? `${user.email} · ${user.phone}` : user?.email} onPress={() => nav.navigate('EditProfile')} />
          {user && !user.verified ? <Row icon="mail-unread-outline" label="Verify your email" sub="Needed for cloud backup and paid plans" onPress={() => nav.navigate('VerifyEmail', { sent: false })} /> : null}
          <Row icon="card-outline" label="Billing" sub={plan === 'free' ? 'Free plan' : `${planInfo.name} plan`} onPress={() => nav.navigate('Billing')} />
          <Row icon="people-outline" label="Family members" sub={planInfo.maxMembers ? `${members.length} of ${planInfo.maxMembers}` : 'Needs a Family plan'} onPress={() => nav.navigate('Family')} />
          <Row icon="key-outline" label="Change password" sub="Choose a new password" onPress={() => setPrompt('password')} />
          <Row icon="phone-portrait-outline" label="Connected devices" sub="This phone" onPress={devices} last />
        </Section>

        <Section title="Security & privacy">
          <Row icon="lock-closed-outline" label="Vault" sub="PIN and fingerprint for private memories" onPress={() => nav.navigate('Vault')} last />
        </Section>

        <Section title="Notifications">
          <Row icon="images-outline" label="New memories" sub="Badge for memories you add" right={sw('notifyNewMemory')} />
          <Row icon="people-outline" label="Family activity" right={sw('notifyFamily')} />
          <Row icon="calendar-outline" label="On This Day" sub="Reminders of past memories" right={sw('notifyOnThisDay')} />
          <Row icon="notifications-outline" label="Notification centre" onPress={() => nav.navigate('Notifications')} last />
        </Section>

        <Section title="Backup">
          <Row icon="cloud-upload-outline" label="Cloud backup" sub={backupSub} onPress={backupNow} />
          <Row icon="wifi-outline" label="Back up on Wi-Fi only" sub="Saves mobile data" right={sw('wifiOnly')} last />
        </Section>

        <Section title="Support">
          <Row icon="help-circle-outline" label="Help & Support" sub="Questions and contact" onPress={() => nav.navigate('Help')} />
          <Row icon="information-circle-outline" label="About TT Memory" sub={`Version ${APP_VERSION}`} right={null} last />
        </Section>

        <View style={{ marginTop: 20 }}>
          <Section title="Account actions">
            <Row icon="log-out-outline" label="Log out" sub="Sign out of this device" onPress={logOut} />
            <Row icon="trash-outline" label="Delete account" sub="Erase everything from this phone" onPress={deleteAccount} danger last />
          </Section>
        </View>
      </ScrollView>
      <PasswordPrompt
        visible={prompt === 'delete'}
        title="Last step"
        text="Enter your password to permanently delete your account and everything in it. This cannot be undone."
        fields={[{ key: 'password', label: 'Password' }]}
        confirmLabel="Delete forever"
        danger
        onConfirm={finishDelete}
        onClose={() => setPrompt(null)}
      />
      <PasswordPrompt
        visible={prompt === 'password'}
        title="Change password"
        fields={[{ key: 'current', label: 'Current password' }, { key: 'password', label: 'New password (8+ characters)' }]}
        confirmLabel="Save"
        onConfirm={finishPassword}
        onClose={() => setPrompt(null)}
      />
      <Bottom active="More" />
    </View>
  );
}