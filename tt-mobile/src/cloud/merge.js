// Works out what the phone should show after asking the server for its list.
// Pure code (no phone features) so it can be tested on its own.
export const isSample = (id) => String(id).startsWith('sample-');
export const needsBackup = (m) => !m.vault && !isSample(m.id) && !!(m.dirty || m.fileDirty);

const fromServer = (r) => ({
  title: r.title,
  description: r.description,
  date: r.date,
  location: r.location,
  album: r.album,
  size: r.size,
  sharedWith: r.sharedWith || [],
  shared: (r.sharedWith || []).length > 0,
  updatedAt: r.updatedAt,
  fileKey: r.fileKey,
});

export function mergeRemote(local, remote, deletedIds = []) {
  const byId = new Map(remote.map((r) => [r.id, r]));
  const localIds = new Set(local.map((m) => m.id));
  const gone = new Set(deletedIds);
  const out = [];

  for (const m of local) {
    if (m.vault || isSample(m.id)) {
      out.push(m);
      continue;
    }
    const r = byId.get(m.id);
    if (!r) {
      // Backed up before, not on the server now, and nothing waiting to be sent: it was deleted elsewhere.
      if (m.fileKey && !m.dirty && !m.fileDirty) continue;
      out.push(m);
      continue;
    }
    const pending = m.dirty || m.fileDirty;
    let next = m;
    if (!pending && r.updatedAt > (m.updatedAt || 0)) next = { ...m, ...fromServer(r) };
    else if (!m.fileDirty) next = { ...m, fileKey: r.fileKey };
    // A memory that only exists in the cloud on this phone shows through a fresh link.
    if (next.remote) next = { ...next, uri: r.url };
    // A copy that arrived almost empty is not a real backup: send it again.
    if (!next.remote && !next.syncError && !next.fileDirty && r.size != null && r.size < 200) {
      next = { ...next, dirty: true, fileDirty: true };
    }
    out.push(next);
  }

  for (const r of remote) {
    if (localIds.has(r.id) || gone.has(r.id)) continue;
    out.push({
      id: r.id,
      type: r.type,
      uri: r.url,
      remote: true,
      vault: false,
      createdAt: r.createdAt,
      dirty: false,
      fileDirty: false,
      ...fromServer(r),
    });
  }
  // Newest first, like the rest of the app
  return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}