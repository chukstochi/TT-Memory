import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, useNavigation, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { s, P, G, M, pics, Logo, Btn, Header, Bottom } from './src/shared';
import { AppProvider, useApp } from './src/store';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import MemoriesScreen from './src/screens/MemoriesScreen';
import AddScreen from './src/screens/AddScreen';
import MemoryDetailScreen from './src/screens/MemoryDetailScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import PlansScreen from './src/screens/PlansScreen';
import FamilyScreen from './src/screens/FamilyScreen';
import VaultScreen from './src/screens/VaultScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import HelpScreen from './src/screens/HelpScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import BillingScreen from './src/screens/BillingScreen';
import ForgotScreen from './src/screens/ForgotScreen';
import VerifyEmailScreen from './src/screens/VerifyEmailScreen';
import { usePaymentSync } from './src/payments/sync';
import { useCloudSync } from './src/cloud/sync';
import { getToken, clearToken } from './src/session';
import { setUnauthorizedHandler } from './src/api';

const navRef = createNavigationContainerRef();

function Onboarding({ navigation }) { return <LinearGradient colors={[P, '#171044', '#08061B']} style={s.dark}><StatusBar style="light" /><View style={{ paddingTop: 55 }}><Logo dark /></View><View style={s.hero}><Image source={{ uri: pics[1] }} style={s.heroImg} /><Image source={{ uri: pics[2] }} style={s.floatImg} /></View><View style={{ padding: 28 }}><Text style={s.darkTitle}>Preserve your{`\n`}<Text style={{ color: G }}>precious moments</Text></Text><Text style={s.darkSub}>Keep your photos, videos, stories and memories safe for generations.</Text><View style={s.dots}><View style={s.dotA} /><View style={s.dot} /><View style={s.dot} /><View style={s.dot} /></View><Btn onPress={() => navigation.navigate('Register')}>Get Started</Btn><Pressable onPress={() => navigation.navigate('Login')}><Text style={s.bottomLink}>Already have an account? <Text style={{ color: G, fontWeight: '700' }}>Log In</Text></Text></Pressable></View></LinearGradient> }
function Stories() { return <View style={s.screen}><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 90 }}><Header title="Stories" /><View style={s.tabs}><Text style={s.tabA}>All Stories</Text><Text style={s.tab}>My Stories</Text><Text style={s.tab}>Family Stories</Text></View>{[0, 1].map(i => <View style={s.story} key={i}><Image source={{ uri: pics[i + 1] }} style={s.storyImg} /><View style={{ padding: 14 }}><Text style={s.card}>{i ? "A day we'll never forget" : 'My Dad and Me'}</Text><Text style={s.muted}>12 Aug 2025</Text><Text style={s.storyText}>The best moments are the ones we share with family.</Text><View style={s.storyFoot}><Ionicons name="heart-outline" size={20} color={P} /><Ionicons name="chatbubble-outline" size={19} color={M} /><Text style={{ marginLeft: 'auto', color: M }}>0:45 ▶</Text></View></View></View>)}</ScrollView><Bottom active="Home" /></View> }
function Simple({ title, sub, items = [] }) { return <View style={s.screen}><ScrollView contentContainerStyle={{ padding: 20 }}><Header title={title} sub={sub} back />{items.map(x => <View key={x[0]} style={s.simpleCard}><View style={s.qIcon}><Ionicons name={x[2] || 'sparkles-outline'} size={22} color={P} /></View><Text style={s.card}>{x[0]}</Text><Text style={s.muted}>{x[1]}</Text><Btn onPress={x[4]}>{x[3] || 'Open'}</Btn></View>)}</ScrollView></View> }

const legacyItems = [["Memory Capsules", "Create special moments that will be revealed in the future.", 'gift-outline', 'Create Capsule'], ['Future Messages', 'Send a message to your loved ones for a future date.', 'mail-outline', 'Write a Message'], ['Family Archive', "Preserve your family's history for generations.", 'library-outline', 'Start Archive']];
function Legacy() { return <Simple title="Legacy" sub="Leave a piece of you behind." items={legacyItems} /> }
const Stack = createNativeStackNavigator();

function Root() {
  const { ready, user, signOut } = useApp();
  const [checked, setChecked] = useState(false);
  usePaymentSync();
  useCloudSync();

  // A login that the server no longer accepts sends the person back to the Login screen.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken();
      signOut();
      if (navRef.isReady()) navRef.reset({ index: 0, routes: [{ name: 'Login' }] });
    });
  }, [signOut]);

  // Someone saved on this phone from before accounts existed has no login. Ask them to log in.
  useEffect(() => {
    if (!ready || checked) return;
    getToken().then((t) => {
      if (!t && user) signOut();
      setChecked(true);
    });
  }, [ready, checked, user, signOut]);

  if (!ready || !checked) return null;
  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator initialRouteName={user ? 'Home' : 'Onboarding'} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={Onboarding} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Forgot" component={ForgotScreen} />
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Memories" component={MemoriesScreen} />
        <Stack.Screen name="Add" component={AddScreen} />
        <Stack.Screen name="MemoryDetail" component={MemoryDetailScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Plans" component={PlansScreen} />
        <Stack.Screen name="Family" component={FamilyScreen} />
        <Stack.Screen name="Stories" component={Stories} />
        <Stack.Screen name="Vault" component={VaultScreen} />
        <Stack.Screen name="Legacy" component={Legacy} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="Help" component={HelpScreen} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="Billing" component={BillingScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}