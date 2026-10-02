import { beforeEach, describe, expect, it } from 'vitest';
import { LocalPlanLibraryRepository } from '../src/repository';
import { BrowserStorageService, LEGACY_DOCUMENT_KEY, PLAN_LIBRARY_KEY } from '../src/storageService';
import type { LayoutDocument } from '../src/types';

describe('BrowserStorageService migration', () => {
  beforeEach(() => window.localStorage.clear());

  it('migrates a real legacy localStorage layout into the plan library', async () => {
    const legacy: LayoutDocument = {
      version: 1,
      title: '华南展区终稿',
      field: { width: 30, height: 20 },
      elements: [
        { id: 'entry-1', kind: 'entrance', name: '主入口', x: 1, y: 9, width: 2.5, height: 1.5, rotation: 0 },
      ],
    };
    window.localStorage.setItem(LEGACY_DOCUMENT_KEY, JSON.stringify(legacy));

    const repository = new LocalPlanLibraryRepository(new BrowserStorageService());
    const plans = await repository.loadLibrary();

    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe('legacy-layout');
    expect(plans[0].name).toBe('华南展区终稿');
    expect(plans[0].document.elements[0].name).toBe('主入口');
    expect(window.localStorage.getItem(LEGACY_DOCUMENT_KEY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(PLAN_LIBRARY_KEY) ?? '[]')).toHaveLength(1);

    const secondLoad = await new LocalPlanLibraryRepository(new BrowserStorageService()).loadLibrary();
    expect(secondLoad).toHaveLength(1);
    expect(secondLoad[0].id).toBe('legacy-layout');
  });
});
