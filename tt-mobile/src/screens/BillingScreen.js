import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { s, P, G, M, T, Header, Btn } from '../shared';
import { useApp, PLANS, formatDate } from '../store';
import { PAYMENTS_ENABLED, naira } from '../payments/config';
import { cancelSubscription, fetchSubscription } from '../api';

const day = (ms) => formatDate(new Date(ms).toISOString().slice(0, 10));

export default function BillingScreen({ navigation }) {
  const { user, plan, subscription, payments, applySubscription } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const info = PLANS.find((p) => p.id === plan) || PLANS[0];
  const paid = plan !== 'free';
  const ending = !!(subscription && subscription.cancelAtPeriodEnd);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const r = await fetchSubscription();
      applySubscription(user.email, r.subscription, r.payments);
    } catch (e) {
      if (e.status !== 401) setError(e.message);
    }
    setBusy(false);
  }, [user, applySubscription]);

  const cancel = () =>
    Alert.alert(
      'Cancel subscription?',
      `You keep the ${info.name} plan until ${subscription?.expiresAt ? day(subscription.expiresAt) : 'the end of this period'}, then go back to Free. You will not be charged again.`,
      [
        { text: 'Keep plan', style: 'cancel' },
        {
          text: 'Cancel subscription',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError('');
            try {
              const r = await cancelSubscription();
              applySubscription(user.email, r.subscription);
            } catch (e) {
              setError(e.message);
            }
            setBusy(false);
          },
        },
      ]
    );

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Header title="Billing" sub="Your plan and payments." back />

        {!PAYMENTS_ENABLED && (
          <View style={{ backgroundColor: '#FFF6E0', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <Text style={{ color: '#7A5A00' }}>Payments are not set up in this build yet.</Text>
          </View>
        )}

        <View style={[s.simpleCard, { backgroundColor: P }]}>
          <Text style={s.whiteM}>Current plan</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', marginTop: 4 }}>{info.name}</Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: G, marginTop: 4 }}>{info.label}{paid ? ` · ${info.price}` : ''}</Text>
          {paid && subscription?.expiresAt ? (
            <Text style={[s.whiteM, { marginTop: 8 }]}>
              {ending ? `Ends on ${day(subscription.expiresAt)}. Then back to Free.` : `Renews around ${day(subscription.expiresAt)}`}
              {subscription.status === 'past_due' ? '\nYour last renewal payment failed. Update your card on Paystack or it will end.' : ''}
            </Text>
          ) : null}
          {!paid && subscription?.status === 'expired' ? (
            <Text style={[s.whiteM, { marginTop: 8 }]}>Your last subscription ended on {day(subscription.expiresAt)}.</Text>
          ) : null}
        </View>

        {!!error && (
          <View style={{ backgroundColor: '#FDECEC', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <Text style={{ color: '#B03030' }}>{error}</Text>
          </View>
        )}

        <View style={{ gap: 10, marginBottom: 8 }}>
          <Btn onPress={() => navigation.navigate('Plans')}>{paid ? 'Change plan' : 'See plans'}</Btn>
          {paid && !ending && <Btn outline onPress={cancel}>Cancel subscription</Btn>}
          <Btn outline onPress={refresh}>{busy ? 'Working…' : 'Refresh'}</Btn>
        </View>
        {busy && <ActivityIndicator color={P} style={{ marginVertical: 8 }} />}

        <Text style={s.section}>Payment history</Text>
        <View style={s.simpleCard}>
          {payments.length === 0 ? (
            <Text style={s.muted}>No payments yet.</Text>
          ) : (
            payments.map((p, i) => {
              const pl = PLANS.find((x) => x.id === p.planId);
              return (
                <View key={p.reference} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: '#F0EDF5' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: T }}>{pl ? pl.name : p.planId} plan</Text>
                    <Text style={s.muted}>{p.paidAt ? day(p.paidAt) : ''}</Text>
                  </View>
                  <Text style={{ fontWeight: '800', color: T }}>{naira(p.amount)}</Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}