import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { useApp } from '../store';
import { PAYMENTS_ENABLED } from '../payments/config';
import { getUploadUrl, listMemories, removeMemory, saveMemory } from '../api';
import { isSample, needsBackup } from './merge';

// Anything in the app can ask for a backup to start now.
const listeners = new Set();
export const requestSync = (force = false) => listeners.forEach((f) => f(force));

const extOf = (uri, type) => {
  const m = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(String(uri));
  const ext = m ? m[1].toLowerCase() : '';
  return ext || (type === 'video' ? 'mp4' : 'jpg');
};
const mimeOf = (type, ext) => (type === 'video' ? `video/${ext === 'mov' ? 'quicktime' : ext}` : `image/${ext === 'jpg' ? 'jpeg' : ext}`);

const details = (m) => ({
  type: m.type,
  title: m.title,
  description: m.description,
  date: m.date,
  location: m.location,
  album: m.album,
  sharedWith: m.sharedWith || [],
  createdAt: m.createdAt,
});

async function onWifiIfNeeded(wifiOnly) {
  if (!wifiOnly) return true;
  try {
    const st = await Network.getNetworkStateAsync();
    return st.type === Network.NetworkStateType.WIFI;
  } catch {
    return true; // if we cannot tell, do not block the backup
  }
}

// Sends the file straight from the phone's storage to the upload link.
function putFile(url, uri, contentType) {
  return new Promise((resolve, reject) => {
    const fail = (msg) => reject(Object.assign(new Error(msg), { status: 0 }));
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.timeout = 10 * 60 * 1000;
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : fail('The upload did not finish. It will try again later.'));
    xhr.onerror = () => fail('Could not reach the server. Check your internet and try again.');
    xhr.ontimeout = () => fail('The upload took too long. It will try again later.');
    xhr.send({ uri }); // React Native reads the file itself
  });
}

async function upload(m) {
  const ext = extOf(m.uri, m.type);
  const up = await getUploadUrl({ id: m.id, type: m.type, size: m.size || 0, ext });
  await putFile(up.uploadUrl, m.uri, mimeOf(m.type, ext));
  return up.fileKey;
}

// One full backup pass: delete what was deleted, upload what is new or changed, then load what the server has.
export async function runCloudSync(app, { force = false } = {}) {
  const { snapshot, patchMemory, clearDeleted, mergeFromCloud, setCloud } = app;
  const wifiOk = await onWifiIfNeeded(snapshot().settings && snapshot().settings.wifiOnly);
  let error = '';
  let waiting = false;
  setCloud({ status: 'syncing', error: '' });

  try {
    // 1. Deletions
    for (const id of [...(snapshot().deletedIds || [])]) {
      await removeMemory(id);
      clearDeleted(id);
    }

    // 2. Uploads and edits
    if (force) {
      snapshot().memories.filter((m) => m.syncError).forEach((m) => patchMemory(m.id, { syncError: null }));
    }
    const queue = snapshot().memories.filter((m) => needsBackup(m) && !m.syncError);
    for (const m of queue) {
      if (m.fileDirty && !wifiOk) {
        waiting = true;
        continue; // big files wait for Wi-Fi when that is the setting
      }
      try {
        const body = details(m);
        if (m.fileDirty || !m.fileKey) body.fileKey = await upload(m);
        const r = await saveMemory(m.id, body);
        if (r.size < 200) {
          // The server received almost nothing, so the file was not read properly. Do not call this backed up.
          await removeMemory(m.id);
          patchMemory(m.id, { fileKey: undefined, fileDirty: true, dirty: true, syncError: 'This file could not be read for upload.' });
          error = 'A file could not be read for upload.';
          continue;
        }
        const now = snapshot().memories.find((x) => x.id === m.id);
        if (!now) {
          await removeMemory(m.id); // deleted on the phone while it was uploading
          continue;
        }
        const unchanged = now.updatedAt === m.updatedAt;
        patchMemory(m.id, {
          fileKey: r.fileKey,
          size: r.size,
          fileDirty: false,
          dirty: unchanged ? false : true,
          updatedAt: unchanged ? r.updatedAt : now.updatedAt,
          syncError: null,
        });
      } catch (e) {
        if (e.status === 401) throw e;
        if (e.status === 413 || e.status === 403 || e.status === 400) {
          patchMemory(m.id, { syncError: e.message }); // needs the person to act (plan full, no videos...)
          error = e.message;
        } else {
          throw e; // network trouble: stop and try again later
        }
      }
    }

    // 3. What the server has (also restores photos on a new phone)
    const remote = await listMemories();
    mergeFromCloud(remote.memories);
    setCloud({
      status: waiting ? 'wifi' : error ? 'error' : 'idle',
      error,
      lastSync: Date.now(),
      used: remote.usedBytes,
      limit: remote.limitBytes,
    });
  } catch (e) {
    if (e.status === 401) return; // the app signs the person out
    setCloud({ status: e.status === 0 ? 'offline' : 'error', error: e.message });
  }
}

// Keeps the backup going: on start, when the app comes back, and shortly after something changes.
export function useCloudSync() {
  const app = useApp();
  const { user, memories, deletedIds } = app;
  const email = user && user.email;
  const busy = useRef(false);
  const again = useRef(false);
  const appRef = useRef(app);
  appRef.current = app;

  const run = useCallback(
    async (force) => {
      if (!PAYMENTS_ENABLED || !appRef.current.user) return;
      if (busy.current) {
        again.current = true;
        return;
      }
      busy.current = true;
      try {
        await runCloudSync(appRef.current, { force: force === true });
      } finally {
        busy.current = false;
        if (again.current) {
          again.current = false;
          setTimeout(() => run(false), 500);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!email) return;
    run(false);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && run(false));
    listeners.add(run);
    return () => {
      sub.remove();
      listeners.delete(run);
    };
  }, [email, run]);

  // Something was added, edited or deleted: back it up after a short pause.
  const pending = memories.filter((m) => needsBackup(m) && !m.syncError).length + (deletedIds || []).length;
  useEffect(() => {
    if (!email || !pending) return;
    const t = setTimeout(() => run(false), 1500);
    return () => clearTimeout(t);
  }, [email, pending, run]);
}