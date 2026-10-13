import React, { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { s, P, G, M, T, Header, Btn } from '../shared';
import { useApp, PLANS, formatBytes, formatDate } from '../store';
import { PAYMENTS_ENABLED } from '../payments/config';
import { cancelSubscription } from '../api';

export default function PlansScreen({ navigation }) {
  const { user, plan, subscription, applySubscription, allMemories, members } = useApp();
  const [busy, setBusy] = useState(false);
  const endDate = subscription?.expiresAt ? formatDate(new Date(subscription.expiresAt).toISOString().slice(0, 10)) : 'the end of this period';
  const used = allMemories.reduce((t, m) => t + (m.size || 0), 0);
  const current = PLANS.find((p) => p.id === plan) || PLANS[0];
  const pct = used ? Math.max(1, Math.min(100, Math.round((used / (current.gb * 1024 ** 3)) * 100))) : 0;

  const doCancel = async () => {
    setBusy(true);
    try {
      const r = await cancelSubscription();
      applySubscription(user.email, r.subscription);
      Alert.alert('Subscription cancelled', `You keep the ${current.name} plan until ${endDate}, then you move to Free. You will not be charged again.`);
    } catch (e) {
      Alert.alert('Could not cancel', e.message);
    }
    setBusy(false);
  };

  const confirmCancel = () =>
    Alert.alert('Cancel subscription?', `You keep the ${current.name} plan until ${endDate}, then you move to Free. You will not be charged again.`, [
      { text: 'Keep plan', style: 'cancel' },
      { text: 'Cancel subscription', style: 'destructive', onPress: doCancel },
    ]);

  const choose = (p) => {
    const smaller = p.gb < current.gb;
    if (smaller && used > p.gb * 1024 ** 3) {
      return Alert.alert(
        'Not enough space',
        `You are using ${formatBytes(used)}, which is more than the ${p.label} in the ${p.name} plan. Delete some memories first.`
      );
    }
    if (smaller && (members || []).length > p.maxMembers) {
      return Alert.alert(
        'Too many family members',
        `The ${p.name} plan allows ${p.maxMembers === 0 ? 'no' : `up to ${p.maxMembers}`} family members. Remove some on the Family screen first.`
      );
    }
    if (smaller && !p.videos && allMemories.some((m) => m.type === 'video')) {
      return Alert.alert(
        'You have videos',
        `The ${p.name} plan does not include videos. Delete your videos first, including any in the Vault.`
      );
    }
    if (p.id === 'free') {
      if (plan === 'free') return;
      if (subscription && subscription.cancelAtPeriodEnd) {
        return Alert.alert('Already cancelled', `You will move to Free on ${endDate}. Until then you keep your ${current.name} plan.`);
      }
      return confirmCancel();
    }
    if (!PAYMENTS_ENABLED) {
      return Alert.alert('Payments not available', 'Payments are not set up in this build yet.');
    }
    navigation.navigate('Checkout', { planId: p.id });
  };

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Header title="Storage Plans" sub="Choose the space that fits your memories." back />

        <View style={[s.simpleCard, { backgroundColor: P }]}>
          <View style={s.row}>
            <Text style={s.white}>{current.name} plan</Text>
            <Text style={s.white}>{pct}%</Text>
          </View>
          <View style={s.progress}><View style={[s.fill, { width: `${pct}%` }]} /></View>
          <Text style={s.whiteM}>{formatBytes(used)} used of {current.label}</Text>
        </View>

        {PLANS.map((p) => {
          const isCurrent = p.id === plan;
          return (
            <View key={p.id} style={[s.simpleCard, isCurrent && { borderColor: G, borderWidth: 2 }]}>
              <View style={[s.row, { alignItems: 'center' }]}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: T }}>{p.name}</Text>
                {isCurrent && (
                  <View style={{ backgroundColor: G, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: P }}>CURRENT</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: P, marginTop: 6 }}>
                {p.label}{p.price === 'Free' ? '' : ` — ${p.price}`}
              </Text>
              <View style={{ marginVertical: 12, gap: 8 }}>
                {p.features.map((f) => (
                  <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="checkmark-circle" size={18} color={P} />
                    <Text style={{ color: '#575363', flex: 1 }}>{f}</Text>
                  </View>
                ))}
              </View>
              {isCurrent && p.id !== 'free' ? (
                <View style={{ gap: 10 }}>
                  {subscription?.expiresAt ? (
                    <Text style={{ color: '#575363' }}>
                      {subscription.cancelAtPeriodEnd
                        ? `Cancelled. Ends on ${formatDate(new Date(subscription.expiresAt).toISOString().slice(0, 10))}.`
                        : `Renews around ${formatDate(new Date(subscription.expiresAt).toISOString().slice(0, 10))}.`}
                    </Text>
                  ) : null}
                  <Btn onPress={() => navigation.navigate('Billing')}>Manage billing</Btn>
                  {!subscription?.cancelAtPeriodEnd ? <Btn outline onPress={confirmCancel}>{busy ? 'Working…' : 'Cancel subscription'}</Btn> : null}
                  {subscription?.cancelAtPeriodEnd ? (
                    <Btn outline onPress={() => navigation.navigate('Checkout', { planId: p.id })}>Resubscribe</Btn>
                  ) : null}
                </View>
              ) : isCurrent ? (
                <Btn outline>Current plan</Btn>
              ) : (
                <Btn onPress={() => choose(p)}>{p.price === 'Free' ? 'Switch to Free' : `Choose ${p.name}`}</Btn>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}