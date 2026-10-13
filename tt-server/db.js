import fs from 'node:fs';
import path from 'node:path';

// A small JSON file store. It is enough for a single server instance.
// Mount a persistent disk at DATA_DIR on your host, or swap this file for a real
// database (Postgres, etc.) once you have many users. The rest of the code only uses
// `db.data` and `db.save()`.
export function createDb(dir) {
  const file = dir ? path.join(dir, 'db.json') : null;
  let data = { payments: {}, subscriptions: {}, users: {}, sessions: {}, resets: {}, locks: {}, memories: {}, meta: {} };

  if (file) {
    fs.mkdirSync(dir, { recursive: true });
    try {
      data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      // first run, or an unreadable file: start empty
    }
  }

  return {
    data,
    save() {
      if (!file) return; // in-memory (tests)
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, file); // atomic replace so a crash never leaves half a file
    },
  };
}
