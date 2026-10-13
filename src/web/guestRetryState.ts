import { withGuestDeadline } from './guestDeadline';

export interface GuestPhotoDraft { uri: string; width: number; height: number }
export interface GuestDraft {
  key: string;
  picks: GuestPhotoDraft[];
  caption: string;
  day: number;
}

const operationsKey = (scope: string) => `kaipa_guest_operations_v1:${scope}`;
export function readGuestOperations<T>(scope: string): Map<string, T> {
  const entries = new Map<string, T>();
  const prefix = `${operationsKey(scope)}:`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) entries.set(key.slice(prefix.length), JSON.parse(localStorage.getItem(key)!));
    }
  } catch { /* writes will report unavailable storage before sending */ }
  return entries;
}
export function saveGuestOperation(scope: string, slot: string, value: unknown) {
  // Separate records avoid one tab overwriting another tab's progress.
  try { localStorage.setItem(`${operationsKey(scope)}:${slot}`, JSON.stringify(value)); }
  catch { throw new Error('无法保存发布进度，请检查浏览器存储后重试'); }
}

// IndexedDB holds photo data URLs, keeping media out of localStorage's small
// quota and avoiding blob URLs that cease to work after page reload.
function draftTransaction<T>(scope: string, mode: IDBTransactionMode,
  run: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  let transaction: IDBTransaction | undefined;
  return withGuestDeadline(async guard => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kaipa_guest_retry_v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('无法保存发布草稿，请检查浏览器存储后重试'));
    });
    try {
      guard();
      return await new Promise<T>((resolve, reject) => {
        transaction = db.transaction('drafts', mode);
        let result: T;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = transaction.onabort = () => reject(new Error('无法保存发布草稿，请检查浏览器存储后重试'));
        run(transaction.objectStore('drafts'), value => { result = value; });
      });
    } finally { db.close(); }
  }, () => transaction?.abort());
}
export function loadGuestDraft(scope: string): Promise<GuestDraft | null> {
  return draftTransaction(scope, 'readonly', (store, done) => {
    const request = store.getAll();
    request.onsuccess = () => done(request.result.find(row => row.scope === scope) || null);
  });
}
export function saveGuestDraft(scope: string, draft: GuestDraft): Promise<void> {
  return draftTransaction(scope, 'readwrite', (store, done) => {
    store.put({ ...draft, scope }, `${scope}:${draft.key}`);
    done(undefined);
  });
}
export function clearGuestDraft(scope: string, key: string): Promise<void> {
  return draftTransaction(scope, 'readwrite', (store, done) => {
    // Separate batch keys also fence late cleanup from a newer operation.
    store.delete(`${scope}:${key}`);
    done(undefined);
  }).then(() => {
    const entries = readGuestOperations<unknown>(scope);
    for (const slot of entries.keys()) {
      if (slot === `key:${key}` || slot.startsWith(`key:${key}:`)) {
        try { localStorage.removeItem(`${operationsKey(scope)}:${slot}`); } catch { /* keep safe old records */ }
      }
    }
  });
}

export function durablePhotoUri(uri: string): Promise<string> {
  if (!uri.startsWith('blob:')) return Promise.resolve(uri);
  return withGuestDeadline(async guard => {
    const blob = await (await fetch(uri)).blob();
    guard();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('无法保存照片，请重新选择'));
      reader.readAsDataURL(blob);
    });
  });
}
