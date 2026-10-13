import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeRemote, isSample } from './cloud/merge';

const KEY = 'tt_app_state_v1';
const U = (id) => `https://images.unsplash.com/${id}?w=800`;

const SAMPLES = [
  { title: 'Family trip to Abuja', description: 'A weekend together exploring the capital.', date: '2024-10-03', location: 'Abuja, Nigeria', album: 'Family Trip', img: 'photo-1504150558240-0b4fd8946624' },
  { title: "Mum's 60th Birthday", description: 'The whole family came together to celebrate Mum.', date: '2023-08-12', location: 'Lagos, Nigeria', album: 'Birthday', img: 'photo-1494386346843-e12284507169' },
  { title: 'Christmas together', description: 'Good food, good music and everyone under one roof.', date: '2022-12-04', location: 'Enugu, Nigeria', album: 'Holidays', img: 'photo-1519741497674-611481863552' },
  { title: 'Sunset by the lake', description: 'A quiet evening watching the sun go down.', date: '2024-03-16', location: 'Jos, Nigeria', album: 'Random', img: 'photo-1475503572774-15a45e5d60b9' },
  { title: 'Weekend getaway', description: 'Time away from the city with the people who matter.', date: '2023-05-27', location: 'Calabar, Nigeria', album: 'Random', img: 'photo-1500530855697-b586d89ba3ee' },
  { title: 'Family reunion', description: 'Cousins, aunties and uncles all in one place.', date: '2021-12-26', location: 'Lagos, Nigeria', album: 'Family Trip', img: 'photo-1511895426328-dc8714191300' },
];

const SEED = SAMPLES.map((m, i) => ({
  id: `sample-${i}`,
  type: 'photo',
  uri: U(m.img),
  size: 0,
  createdAt: 0,
  title: m.title,
  description: m.description,
  date: m.date,
  location: m.location,
  album: m.album,
}));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const PLANS = [
  { id: 'free', name: 'Free', gb: 5, maxMembers: 0, videos: false, label: '5 GB', price: 'Free', features: ['Basic backup', 'Photos', 'Basic albums'] },
  { id: 'personal', name: 'Personal', gb: 100, maxMembers: 0, videos: true, label: '100 GB', price: '₦1,000/month', features: ['Automatic backup', 'Videos', 'AI search', 'Timeline', 'Unlimited albums'] },
  { id: 'family', name: 'Family', gb: 500, maxMembers: 5, videos: true, label: '500 GB', price: '₦3,000/month', features: ['Up to 5 family members', 'Shared family archive', 'Family timeline', 'Memory capsules'] },
  { id: 'family-plus', name: 'Family Plus', gb: 1024, maxMembers: 10, videos: true, label: '1 TB', price: '₦5,000/month', features: ['Up to 10 members', 'Advanced AI', 'Family vault', 'Priority support'] },
];

export const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const formatDate = (iso) => {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y || !m || !d) return iso || '';
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

export const formatBytes = (b) => {
  if (!b) return '0 MB';
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export const initials = (name) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

const nameFromEmail = (email) => {
  const local = (email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  if (!local) return 'Friend';
  return local.split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
};

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const DEFAULT_SETTINGS = { notifyNewMemory: true, notifyFamily: true, notifyOnThisDay: true, wifiOnly: true };

const freshData = () => ({ memories: SEED, members: [], lastSeen: 0, deletedIds: [] });
const bundle = (s) => ({ memories: s.memories, members: s.members, lastSeen: s.lastSeen, deletedIds: s.deletedIds || [] });

// Older versions kept every person's memories in one shared list. Hand that list to the
// first account that was created on this phone and start everyone else with their own.
const migrate = (s) => {
  if (s.accounts) return s;
  const owner = Object.keys(s.profiles || {})[0] || (s.user && s.user.email) || null;
  const legacy = { memories: s.memories || SEED, members: s.members || [], lastSeen: s.lastSeen || 0, deletedIds: [] };
  const accounts = {};
  let active = freshData();
  if (owner) {
    if (s.user && s.user.email === owner) active = legacy;
    else accounts[owner] = legacy;
  }
  return { ...s, ...active, accounts };
};

// Photos saved before cloud backup existed have never been uploaded. Queue them.
const markLegacy = (list) =>
  (list || []).map((m) =>
    !isSample(m.id) && !m.vault && m.fileKey === undefined && m.dirty === undefined ? { ...m, dirty: true, fileDirty: true } : m
  );
const queueLegacy = (s) => ({
  ...s,
  memories: markLegacy(s.memories),
  accounts: Object.fromEntries(Object.entries(s.accounts || {}).map(([k, b]) => [k, { ...b, memories: markLegacy(b.memories) }])),
});

const INITIAL = { user: null, memories: SEED, lastSeen: 0, plan: 'free', members: [], settings: DEFAULT_SETTINGS, profiles: {}, subscription: null, payments: [], accounts: {}, deletedIds: [], cloud: { status: 'idle', lastSync: 0, error: '', used: 0, limit: 0 } };

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState(INITIAL);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          setState((prev) => queueLegacy(saved.accounts ? { ...prev, ...saved } : migrate({ ...prev, ...saved, accounts: undefined })));
        }
      } catch {}
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const signIn = useCallback(({ name, email, verified }) => {
    setState((s) => {
      const e = (email || '').trim().toLowerCase();
      const saved = (s.profiles || {})[e] || {};
      const nm = (name || '').trim() || saved.name || nameFromEmail(e);
      const user = { ...saved, name: nm, email: e, verified: !!verified };

      // Each account has its own memories, family and Vault. Swap them in and out here.
      const accounts = { ...(s.accounts || {}) };
      const prevEmail = s.user && s.user.email;
      if (prevEmail && prevEmail !== e) accounts[prevEmail] = bundle(s);
      let data;
      if (prevEmail === e) data = bundle(s);
      else if (accounts[e]) data = { ...freshData(), ...accounts[e] };
      else data = freshData();
      delete accounts[e];

      // A plan belongs to the email that paid for it.
      const other = s.subscription && s.subscription.email !== e;
      const plan = other ? 'free' : s.plan;
      const subscription = other ? null : s.subscription;
      const payments = other ? [] : s.payments;
      return { ...s, ...data, cloud: INITIAL.cloud, accounts, user, plan, subscription, payments, profiles: { ...(s.profiles || {}), [e]: user } };
    });
  }, []);

  const updateProfile = useCallback((changes) => {
    setState((s) => {
      if (!s.user) return s;
      const user = { ...s.user, ...changes };
      const profiles = { ...(s.profiles || {}) };
      if (user.email !== s.user.email) delete profiles[s.user.email];
      profiles[user.email] = user;
      return { ...s, user, profiles };
    });
  }, []);

  const updateSettings = useCallback((changes) => {
    setState((s) => ({ ...s, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}), ...changes } }));
  }, []);

  const resetAll = useCallback(() => setState(INITIAL), []);

  const signOut = useCallback(() => {
    setState((s) => {
      if (!s.user) return s;
      const accounts = { ...(s.accounts || {}), [s.user.email]: bundle(s) };
      // Nothing from this account stays loaded once they log out.
      return { ...s, ...freshData(), cloud: INITIAL.cloud, accounts, user: null, plan: 'free', subscription: null, payments: [] };
    });
  }, []);

  // Removes only the signed-in account. Other accounts on this phone are left alone.
  const deleteAccount = useCallback(() => {
    setState((s) => {
      const profiles = { ...(s.profiles || {}) };
      if (s.user) delete profiles[s.user.email];
      return { ...INITIAL, accounts: s.accounts || {}, profiles };
    });
  }, []);

  const addMemory = useCallback((m) => {
    setState((s) => ({
      ...s,
      memories: [
        {
          ...m,
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          // New photos and videos wait to be backed up (the Vault is never backed up).
          dirty: !m.vault,
          fileDirty: !m.vault,
        },
        ...s.memories,
      ],
    }));
  }, []);

  const deleteMemory = useCallback((id) => {
    setState((s) => {
      const m = s.memories.find((x) => x.id === id);
      // If it was backed up, remember to delete the cloud copy too.
      const deletedIds = m && m.fileKey && !isSample(id) ? [...(s.deletedIds || []), id] : s.deletedIds || [];
      return { ...s, deletedIds, memories: s.memories.filter((x) => x.id !== id) };
    });
  }, []);

  const updateMemory = useCallback((id, changes) => {
    setState((s) => ({
      ...s,
      memories: s.memories.map((m) => {
        if (m.id !== id) return m;
        const next = { ...m, ...changes, updatedAt: Date.now() };
        if (!next.vault && !isSample(id)) {
          next.dirty = true;
          if (changes.uri && changes.uri !== m.uri) {
            next.fileDirty = true;
            next.remote = false;
          }
          next.syncError = null;
        }
        return next;
      }),
    }));
  }, []);

  const setPlan = useCallback((plan) => setState((s) => ({ ...s, plan })), []);

  // The server is the source of truth for the plan. `payments` is optional (kept if left out).
  const applySubscription = useCallback((email, sub, payments) => {
    setState((s) => {
      if (!s.user || s.user.email !== email) return s;
      const same = s.subscription && s.subscription.email === email;
      return {
        ...s,
        plan: sub.planId,
        subscription: { ...sub, email },
        payments: payments || (same ? s.payments || [] : []),
      };
    });
  }, []);

  const addMember = useCallback((m) => {
    setState((s) => ({
      ...s,
      members: [...(s.members || []), { ...m, id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }],
    }));
  }, []);

  const updateMember = useCallback((id, changes) => {
    setState((s) => ({ ...s, members: (s.members || []).map((x) => (x.id === id ? { ...x, ...changes } : x)) }));
  }, []);

  const removeMember = useCallback((id) => {
    setState((s) => ({
      ...s,
      members: (s.members || []).filter((x) => x.id !== id),
      memories: s.memories.map((m) =>
        m.sharedWith && m.sharedWith.includes(id) ? { ...m, sharedWith: m.sharedWith.filter((x) => x !== id), dirty: !m.vault && !isSample(m.id) } : m
      ),
    }));
  }, []);

  const markSeen = useCallback(() => setState((s) => ({ ...s, lastSeen: Date.now() })), []);

  // ---- cloud backup (used by src/cloud/sync.js) ----
  const stateRef = useRef(state);
  stateRef.current = state;
  const snapshot = useCallback(() => stateRef.current, []);
  const patchMemory = useCallback((id, patch) => {
    setState((s) => ({ ...s, memories: s.memories.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  }, []);
  const clearDeleted = useCallback((id) => {
    setState((s) => ({ ...s, deletedIds: (s.deletedIds || []).filter((x) => x !== id) }));
  }, []);
  const mergeFromCloud = useCallback((remote) => {
    setState((s) => ({ ...s, memories: mergeRemote(s.memories, remote, s.deletedIds || []) }));
  }, []);
  const setCloud = useCallback((patch) => {
    setState((s) => ({ ...s, cloud: { ...INITIAL.cloud, ...(s.cloud || {}), ...patch } }));
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user: state.user,
      memories: state.memories.filter((m) => !m.vault),
      vaultItems: state.memories.filter((m) => m.vault),
      allMemories: state.memories,
      lastSeen: state.lastSeen,
      plan: state.plan,
      subscription: state.subscription || null,
      payments: state.payments || [],
      members: state.members || [],
      settings: { ...DEFAULT_SETTINGS, ...(state.settings || {}) },
      unread: (state.settings || DEFAULT_SETTINGS).notifyNewMemory === false
        ? 0
        : state.memories.filter((m) => !m.vault && m.createdAt > state.lastSeen).length,
      signIn,
      signOut,
      updateProfile,
      updateSettings,
      resetAll,
      deleteAccount,
      addMemory,
      deleteMemory,
      updateMemory,
      setPlan,
      applySubscription,
      addMember,
      updateMember,
      removeMember,
      markSeen,
      cloud: state.cloud || INITIAL.cloud,
      deletedIds: state.deletedIds || [],
      snapshot,
      patchMemory,
      clearDeleted,
      mergeFromCloud,
      setCloud,
    }),
    [ready, state, signIn, signOut, updateProfile, updateSettings, resetAll, deleteAccount, addMemory, deleteMemory, updateMemory, setPlan, applySubscription, addMember, updateMember, removeMember, markSeen, snapshot, patchMemory, clearDeleted, mergeFromCloud, setCloud]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}