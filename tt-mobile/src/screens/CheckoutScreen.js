import React, { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { s, P, G, M, T, Header, Btn } from '../shared';
import { useApp, PLANS, formatDate } from '../store';
import { PAYMENTS_ENABLED } from '../payments/config';
import { initializePayment, fetchSubscription } from '../api';
import { savePending } from '../payments/token';
import { settlePending } from '../payments/sync';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default function CheckoutScreen({ route, navigation }) {
  const { user, applySubscription } = useApp();
  const target = PLANS.find((p) => p.id === route.params?.planId) || PLANS[1];
  const [stage, setStage] = useState('summary'); // summary | working | checking | success | notpaid
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // Asks the server whether the payment went through. Paystack can take a few seconds.
  const confirm = async () => {
    setStage('checking');
    setError('');
    for (let i = 0; i < 6; i++) {
      try {
        let r = await settlePending(user.email);
        if (r.status === 'none') {
          // Another part of the app may have already confirmed it.
          const sub = await fetchSubscription();
          if (sub.subscription.planId === target.id) r = { status: 'success', ...sub };
        }
        if (r.status === 'success') {
          applySubscription(user.email, r.subscription, r.payments);
          setResult(r.subscription);
          setStage('success');
          return;
        }
        if (r.status !== 'pending' && r.status !== 'none') break;
      } catch (e) {
        if (i === 5) {
          setError(e.message);
          break;
        }
      }
      await wait(2000);
    }
    setStage('notpaid');
  };

  const pay = async () => {
    setError('');
    if (!PAYMENTS_ENABLED) {
      return setError('Payments are not set up in this build yet. Add EXPO_PUBLIC_API_URL and restart the app.');
    }
    setStage('working');
    try {
      const callbackUrl = Linking.createURL('payment-complete');
      const init = await initializePayment({ planId: target.id, callbackUrl });
      await savePending({ email: user.email, reference: init.reference, createdAt: Date.now() });
      await WebBrowser.openAuthSessionAsync(init.authorizationUrl, callbackUrl);
      await confirm();
    } catch (e) {
      setError(e.message);
      setStage('summary');
    }
  };

  const busy = stage === 'working' || stage === 'checking';

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Header title={stage === 'success' ? 'Payment complete' : 'Checkout'} back={!busy} />

        {stage === 'success' ? (
          <View style={[s.simpleCard, { alignItems: 'center', paddingVertical: 28 }]}>
            <Ionicons name="checkmark-circle" size={64} color="#2E9E5B" />
            <Text style={[s.h1, { marginTop: 12 }]}>You are on {target.name}</Text>
            <Text style={[s.muted, { textAlign: 'center', marginTop: 6 }]}>
              {target.label} of storage{result?.expiresAt ? `. Renews around ${formatDate(new Date(result.expiresAt).toISOString().slice(0, 10))}.` : '.'}
            </Text>
            <View style={{ alignSelf: 'stretch', marginTop: 20, gap: 10 }}>
              <Btn onPress={() => navigation.navigate('Home')}>Go to Home</Btn>
              <Btn outline onPress={() => navigation.replace('Billing')}>View billing</Btn>
            </View>
          </View>
        ) : (
          <>
            <View style={[s.simpleCard, { backgroundColor: P }]}>
              <Text style={s.whiteM}>You are subscribing to</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', marginTop: 4 }}>{target.name}</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: G, marginTop: 4 }}>{target.label} · {target.price}</Text>
            </View>

            <View style={s.simpleCard}>
              {target.features.map((f) => (
                <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Ionicons name="checkmark-circle" size={18} color={P} />
                  <Text style={{ color: '#575363', flex: 1 }}>{f}</Text>
                </View>
              ))}
              <View style={{ height: 1, backgroundColor: '#F0EDF5', marginVertical: 10 }} />
              <Text style={s.muted}>Billed to</Text>
              <Text style={{ fontWeight: '700', color: T, marginTop: 2 }}>{user?.email}</Text>
              <Text style={[s.muted, { marginTop: 10 }]}>
                You pay on Paystack's secure page, so card details never touch this app. The plan renews every month until you cancel, and you can cancel any time from Billing.
              </Text>
            </View>

            {!!error && (
              <View style={{ backgroundColor: '#FDECEC', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <Text style={{ color: '#B03030' }}>{error}</Text>
              </View>
            )}

            {stage === 'notpaid' && (
              <View style={{ backgroundColor: '#FFF6E0', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <Text style={{ color: '#7A5A00' }}>
                  We have not received a confirmed payment yet. If you already paid, tap Check again in a moment. You will not be charged twice.
                </Text>
              </View>
            )}

            {busy ? (
              <View style={{ alignItems: 'center', padding: 20 }}>
                <ActivityIndicator color={P} />
                <Text style={[s.muted, { marginTop: 10 }]}>{stage === 'working' ? 'Opening secure checkout…' : 'Confirming your payment…'}</Text>
              </View>
            ) : stage === 'notpaid' ? (
              <View style={{ gap: 10 }}>
                <Btn onPress={confirm}>Check again</Btn>
                <Btn outline onPress={pay}>Start a new payment</Btn>
              </View>
            ) : (
              <Btn onPress={pay}>{`Pay with Paystack`}</Btn>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}