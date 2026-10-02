import { afterEach, describe, expect, it } from 'vitest';
import { createStarterDocument } from '../src/domain';
import { LocalSchemeRepository } from '../src/repository';
import { BrowserStorageService, LEGACY_DOCUMENT_KEY, LIBRARY_KEY } from '../src/storageService';
import type { LayoutDocument } from '../src/types';

afterEach(() => window.localStorage.clear());

describe('BrowserStorageService + LocalSchemeRepository (localStorage fallback)', () => {
  it('migrates the real legacy single-layout key into the scheme library', async () => {
    const legacy: LayoutDocument = { ...createStarterDocument(), title: '真实存储里的旧布局' };
    window.localStorage.setItem(LEGACY_DOCUMENT_KEY, JSON.stringify(legacy));

    const repository = new LocalSchemeRepository(new BrowserStorageService());
    const library = await repository.loadLibrary();

    expect(library.schemes).toHaveLength(1);
    expect(library.schemes[0].name).toBe('真实存储里的旧布局');
    expect(library.schemes[0].document).toEqual(legacy);
    // 旧键已清除，库里的内容被持久化
    expect(window.localStorage.getItem(LEGACY_DOCUMENT_KEY)).toBeNull();
    const persisted = JSON.parse(window.localStorage.getItem(LIBRARY_KEY) ?? 'null');
    expect(persisted.schemes[0].document).toEqual(legacy);

    // 第二次启动不会重复迁移
    const again = await repository.loadLibrary();
    expect(again.schemes).toHaveLength(1);
  });

  it('falls back to a starter scheme when nothing exists and JSON is damaged', async () => {
    window.localStorage.setItem(LEGACY_DOCUMENT_KEY, '{broken-json');
    const library = await new LocalSchemeRepository(new BrowserStorageService()).loadLibrary();
    expect(library.schemes).toHaveLength(1);
    expect(library.schemes[0].document).toEqual(createStarterDocument());
    expect(window.localStorage.getItem(LEGACY_DOCUMENT_KEY)).toBeNull();
  });
});
