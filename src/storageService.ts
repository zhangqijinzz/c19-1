export const LEGACY_DOCUMENT_KEY = 'exposketch.document.v1';
export const PLAN_LIBRARY_KEY = 'exposketch.plans.v1';

export interface JsonStorageService {
  readJson<T>(key: string): Promise<T | null>;
  writeJson(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

const canUseIndexedDb = () => typeof indexedDB !== 'undefined';

export class BrowserStorageService implements JsonStorageService {
  async readJson<T>(key: string): Promise<T | null> {
    if (!canUseIndexedDb()) {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    return this.withDatabase((store) => new Promise<T | null>((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('读取数据失败'));
    }));
  }

  async writeJson(key: string, value: unknown): Promise<void> {
    if (!canUseIndexedDb()) {
      window.localStorage.setItem(key, JSON.stringify(value));
      return;
    }
    await this.withDatabase((store) => new Promise<void>((resolve, reject) => {
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('保存数据失败'));
    }));
  }

  async remove(key: string): Promise<void> {
    if (!canUseIndexedDb()) {
      window.localStorage.removeItem(key);
      return;
    }
    await this.withDatabase((store) => new Promise<void>((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('删除数据失败'));
    }));
  }

  private withDatabase<T>(run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('exposketch-db', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('documents');
      request.onerror = () => reject(request.error ?? new Error('打开本地数据库失败'));
      request.onsuccess = () => {
        const transaction = request.result.transaction('documents', 'readwrite');
        run(transaction.objectStore('documents')).then(resolve).catch(reject);
        transaction.oncomplete = () => request.result.close();
      };
    });
  }
}
