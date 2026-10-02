import { describe, expect, it, vi } from 'vitest';
import { createSchemeFromDocument, createStarterDocument } from '../src/domain';
import { LEGACY_DOCUMENT_KEY, LIBRARY_KEY, type KeyValueStorageService } from '../src/storageService';
import { LocalSchemeRepository, repairLibrary } from '../src/repository';
import type { LayoutDocument, SchemeLibrary } from '../src/types';

const createMemoryStorage = (initial: Record<string, unknown> = {}): KeyValueStorageService & { data: Record<string, unknown> } => {
  const data = { ...initial };
  return {
    data,
    async read<T>(key: string) { return (data[key] as T | undefined) ?? null; },
    async write<T>(key: string, value: T) { data[key] = value; },
    async remove(key: string) { delete data[key]; },
  };
};

const starterLibrary = (): SchemeLibrary => {
  const starter = createStarterDocument();
  return { version: 1, schemes: [createSchemeFromDocument(starter, starter.title)] };
};

describe('LocalSchemeRepository migration', () => {
  it('turns the legacy single layout into the first scheme without losing it', async () => {
    const legacy: LayoutDocument = { ...createStarterDocument(), title: '我的二号展区', elements: createStarterDocument().elements.map((element, index) => index === 0 ? { ...element, name: '侧门' } : element) };
    const storage = createMemoryStorage({ [LEGACY_DOCUMENT_KEY]: legacy });
    const repository = new LocalSchemeRepository(storage);

    const library = await repository.loadLibrary();

    expect(library.schemes).toHaveLength(1);
    expect(library.schemes[0].name).toBe('我的二号展区');
    expect(library.schemes[0].document).toEqual(legacy);
    // 迁移完成后旧键删除，重复启动不会再生成第二份
    expect(storage.data[LEGACY_DOCUMENT_KEY]).toBeUndefined();
    expect((storage.data[LIBRARY_KEY] as SchemeLibrary).schemes).toHaveLength(1);
    expect(await repository.loadLibrary()).toEqual(library);
  });

  it('does not let the starter example displace existing schemes', async () => {
    const existing = starterLibrary();
    const storage = createMemoryStorage({
      [LIBRARY_KEY]: existing,
      [LEGACY_DOCUMENT_KEY]: { ...createStarterDocument(), title: '又一份旧布局' },
    });
    const repository = new LocalSchemeRepository(storage);

    const library = await repository.loadLibrary();
    expect(library).toEqual(existing);
    expect(storage.data[LEGACY_DOCUMENT_KEY]).toBeUndefined();
  });

  it('creates the starter scheme only on a genuinely first run', async () => {
    const storage = createMemoryStorage();
    const repository = new LocalSchemeRepository(storage);

    const library = await repository.loadLibrary();
    expect(library.schemes).toHaveLength(1);
    expect(library.schemes[0].document).toEqual(createStarterDocument());
  });

  it('migrates the legacy document when the stored library is corrupted', async () => {
    const legacy = { ...createStarterDocument(), title: '抢救回来的布局' };
    const storage = createMemoryStorage({ [LIBRARY_KEY]: '{broken', [LEGACY_DOCUMENT_KEY]: legacy });
    const repository = new LocalSchemeRepository(storage);

    const library = await repository.loadLibrary();
    expect(library.schemes).toHaveLength(1);
    expect(library.schemes[0].name).toBe('抢救回来的布局');
  });

  it('repairs a partially damaged library by dropping only bad schemes', async () => {
    const good = starterLibrary().schemes[0];
    const damaged: unknown = { version: 1, schemes: [good, { id: 'bad' }, { ...good, id: 'good-2', name: '第二个' }] };
    const storage = createMemoryStorage({ [LIBRARY_KEY]: damaged });
    const repository = new LocalSchemeRepository(storage);

    const library = await repository.loadLibrary();
    expect(library.schemes.map((scheme) => scheme.id)).toEqual([good.id, 'good-2']);
  });

  it('keeps an empty (all-schemes-deleted) library empty instead of seeding examples', async () => {
    const storage = createMemoryStorage({ [LIBRARY_KEY]: { version: 1, schemes: [] } });
    const repository = new LocalSchemeRepository(storage);

    const library = await repository.loadLibrary();
    expect(library.schemes).toEqual([]);
  });

  it('uses the document title for migrated schemes and falls back when blank', async () => {
    const storage = createMemoryStorage({ [LEGACY_DOCUMENT_KEY]: { ...createStarterDocument(), title: '   ' } });
    const library = await new LocalSchemeRepository(storage).loadLibrary();
    expect(library.schemes[0].name).toBe('本地布局');
  });

  it('saves the whole library through the storage service', async () => {
    const storage = createMemoryStorage();
    const write = vi.spyOn(storage, 'write');
    const repository = new LocalSchemeRepository(storage);
    const library = await repository.loadLibrary();
    write.mockClear();
    await repository.saveLibrary(library);
    expect(write).toHaveBeenCalledWith(LIBRARY_KEY, library);
  });
});

describe('repairLibrary', () => {
  it('rejects values that are not a library', () => {
    expect(repairLibrary(null)).toBeNull();
    expect(repairLibrary({ version: 2, schemes: [] })).toBeNull();
    expect(repairLibrary({ schemes: [] })).toBeNull();
  });
});
