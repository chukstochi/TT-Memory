import crypto from 'node:crypto';
import { PLAN_LIMITS } from './config.js';
import { ApiError } from './service.js';
import { validKey } from './storage.js';

const ID_RE = /^[\w-]{1,64}$/;
const sha256hex = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const prefixFor = (email) => `u/${sha256hex(email).slice(0, 24)}/`;
const EXT = { jpg: 1, jpeg: 1, png: 1, heic: 1, heif: 1, webp: 1, gif: 1, mp4: 1, mov: 1, m4v: 1, '3gp': 1, webm: 1 };
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export function createMemories(db, storage, { planOf, now = () => Date.now() }) {
  const all = db.data.memories;
  const mine = (email) => (all[email] = all[email] || {});
  const used = (email, exceptId) =>
    Object.values(mine(email)).reduce((t, m) => t + (m.id === exceptId ? 0 : m.size || 0), 0);
  const limits = (email) => PLAN_LIMITS[planOf(email)] || PLAN_LIMITS.free;

  const toPublic = (m, base) => ({
    id: m.id,
    type: m.type,
    title: m.title,
    description: m.description,
    date: m.date,
    location: m.location,
    album: m.album,
    size: m.size,
    sharedWith: m.sharedWith || [],
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    fileKey: m.fileKey,
    url: storage.presign('GET', m.fileKey, { expires: 6 * 3600, base }),
  });

  return {
    list(email, base) {
      const lim = limits(email);
      return {
        memories: Object.values(mine(email)).map((m) => toPublic(m, base)),
        usedBytes: used(email),
        limitBytes: lim.bytes,
      };
    },

    // Gives the phone a one-time link to upload a file to. Checks the plan first.
    uploadUrl(email, { id, type, size, ext }, base) {
      if (!ID_RE.test(String(id))) throw new ApiError(400, 'Bad memory id.');
      if (type !== 'photo' && type !== 'video') throw new ApiError(400, 'Bad file type.');
      ext = String(ext || (type === 'video' ? 'mp4' : 'jpg')).toLowerCase().replace(/^\./, '');
      if (!EXT[ext]) throw new ApiError(400, 'That file format is not supported.');
      size = Number(size) || 0;
      const lim = limits(email);
      if (type === 'video' && !lim.videos) throw new ApiError(403, 'Videos are not included in your plan.');
      if (used(email, id) + size > lim.bytes) throw new ApiError(413, 'You have run out of storage on your plan.');
      const fileKey = `${prefixFor(email)}${id}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      return { fileKey, uploadUrl: storage.presign('PUT', fileKey, { expires: 3600, base }) };
    },

    // Saves a memory's details. When there is a new file, it is checked and counted here.
    async save(email, id, body) {
      if (!ID_RE.test(String(id))) throw new ApiError(400, 'Bad memory id.');
      const old = mine(email)[id];
      const type = body.type === 'video' ? 'video' : 'photo';
      let { fileKey, size } = old || {};

      if (body.fileKey && body.fileKey !== (old && old.fileKey)) {
        if (!validKey(body.fileKey) || !body.fileKey.startsWith(prefixFor(email))) throw new ApiError(400, 'Bad file.');
        const real = await storage.size(body.fileKey);
        if (real == null) throw new ApiError(400, 'The file was not uploaded.');
        const lim = limits(email);
        if (type === 'video' && !lim.videos) {
          await storage.remove(body.fileKey);
          throw new ApiError(403, 'Videos are not included in your plan.');
        }
        if (used(email, id) + real > lim.bytes) {
          await storage.remove(body.fileKey);
          throw new ApiError(413, 'You have run out of storage on your plan.');
        }
        if (old && old.fileKey) await storage.remove(old.fileKey); // replaced photo
        fileKey = body.fileKey;
        size = real;
      }
      if (!fileKey) throw new ApiError(400, 'A file is needed.');

      const t = now();
      mine(email)[id] = {
        id,
        type,
        title: text(body.title, 200),
        description: text(body.description, 2000),
        date: text(body.date, 20),
        location: text(body.location, 200),
        album: text(body.album, 100),
        sharedWith: Array.isArray(body.sharedWith) ? body.sharedWith.filter((x) => typeof x === 'string').slice(0, 20) : [],
        fileKey,
        size,
        createdAt: (old && old.createdAt) || Number(body.createdAt) || t,
        updatedAt: t,
      };
      db.save();
      return { id, updatedAt: t, size, fileKey };
    },

    async remove(email, id) {
      const m = mine(email)[id];
      if (!m) return { ok: true };
      try {
        await storage.remove(m.fileKey);
      } catch (e) {
        throw new ApiError(502, 'Could not delete the file. Please try again.');
      }
      delete mine(email)[id];
      db.save();
      return { ok: true };
    },

    // Used when an account is deleted: every file and record goes.
    async eraseAll(email) {
      for (const m of Object.values(mine(email))) {
        try {
          await storage.remove(m.fileKey);
        } catch {}
      }
      delete all[email];
      db.save();
    },
  };
}
