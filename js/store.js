// @ts-check
/* =====================================================================
 * 持久化：IndexedDB 优先 → localStorage 降级 → 内存兜底（Node 测试）
 * 三仓：games（对局存档，含进行中 'current'）、progress（键值进度）、mistakes（错题）
 * ===================================================================== */

/** 内存实现（兜底/测试） */
export function createMemoryStore() {
  const db = { games: new Map(), progress: new Map(), mistakes: new Map() };
  return {
    async saveGame(rec) { db.games.set(rec.id, { ...rec }); },
    async getGame(id) { return db.games.get(id) ? { ...db.games.get(id) } : undefined; },
    async listGames() { return [...db.games.values()].map(g => ({ ...g })).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); },
    async deleteGame(id) { db.games.delete(id); },
    async getProgress(key, def) { return db.progress.has(key) ? db.progress.get(key) : def; },
    async setProgress(key, value) { db.progress.set(key, value); },
    async addMistake(rec) { db.mistakes.set(rec.id, { ...rec }); },
    async listMistakes() { return [...db.mistakes.values()].map(m => ({ ...m })); },
    async deleteMistake(id) { db.mistakes.delete(id); }
  };
}

/** localStorage 实现（键前缀分仓） */
function createLocalStore() {
  const k = (store, id) => 'xq-' + store + '-' + id;
  const readAll = store => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('xq-' + store + '-')) out.push(JSON.parse(localStorage.getItem(key)));
    }
    return out;
  };
  return {
    async saveGame(rec) { localStorage.setItem(k('games', rec.id), JSON.stringify(rec)); },
    async getGame(id) { const s = localStorage.getItem(k('games', id)); return s ? JSON.parse(s) : undefined; },
    async listGames() { return readAll('games').sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); },
    async deleteGame(id) { localStorage.removeItem(k('games', id)); },
    async getProgress(key, def) {
      const s = localStorage.getItem(k('progress', key));
      return s === null ? def : JSON.parse(s);
    },
    async setProgress(key, value) { localStorage.setItem(k('progress', key), JSON.stringify(value)); },
    async addMistake(rec) { localStorage.setItem(k('mistakes', rec.id), JSON.stringify(rec)); },
    async listMistakes() { return readAll('mistakes'); },
    async deleteMistake(id) { localStorage.removeItem(k('mistakes', id)); }
  };
}

/** IndexedDB 实现 */
function createIdbStore(idb) {
  const open = () => new Promise((resolve, reject) => {
    const req = idb.open('xq-teach', 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('games')) d.createObjectStore('games', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('progress')) d.createObjectStore('progress');
      if (!d.objectStoreNames.contains('mistakes')) d.createObjectStore('mistakes', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  let dbP = null;
  const tx = async (store, mode, fn) => {
    if (!dbP) dbP = open();
    const db = await dbP;
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const rq = fn(t.objectStore(store));
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  };
  return {
    async saveGame(rec) { await tx('games', 'readwrite', s => s.put(rec)); },
    async getGame(id) { return tx('games', 'readonly', s => s.get(id)); },
    async listGames() { return tx('games', 'readonly', s => s.getAll()); },
    async deleteGame(id) { await tx('games', 'readwrite', s => s.delete(id)); },
    async getProgress(key, def) {
      try { const v = await tx('progress', 'readonly', s => s.get(key)); return v === undefined ? def : v; }
      catch (e) { return def; }
    },
    async setProgress(key, value) { await tx('progress', 'readwrite', s => s.put(value, key)); },
    async addMistake(rec) { await tx('mistakes', 'readwrite', s => s.put(rec)); },
    async listMistakes() { return tx('mistakes', 'readonly', s => s.getAll()); },
    async deleteMistake(id) { await tx('mistakes', 'readwrite', s => s.delete(id)); }
  };
}

/** 自动选择可用实现 */
export function createStore() {
  try {
    if (typeof indexedDB !== 'undefined') return createIdbStore(indexedDB);
  } catch (e) { /* 降级 */ }
  try {
    if (typeof localStorage !== 'undefined') return createLocalStore();
  } catch (e) { /* 降级 */ }
  return createMemoryStore();
}
export const store = createStore();
