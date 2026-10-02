import { describe, expect, it } from 'vitest';
import { LocalPlanLibraryRepository } from '../src/repository';
import { LEGACY_DOCUMENT_KEY, PLAN_LIBRARY_KEY, type JsonStorageService } from '../src/storageService';
import type { LayoutDocument, LayoutPlan } from '../src/types';

const documentFixture = (title = '旧版本地布局'): LayoutDocument => ({
  version: 1,
  title,
  field: { width: 20, height: 14 },
  elements: [
    { id: 'entry-1', kind: 'entrance', name: '入口', x: 1, y: 5, width: 2.5, height: 1.5, rotation: 0 },
    { id: 'stage-1', kind: 'stage', name: '舞台', x: 8, y: 2, width: 6, height: 3, rotation: 0 },
  ],
});

const memoryStorage = (data: Record<string, unknown> = {}): JsonStorageService & { data: Record<string, unknown> } => ({
  data,
  readJson: async (key) => (key in data ? (data[key] as never) : null),
  writeJson: async (key, value) => { data[key] = value; },
  remove: async (key) => { delete data[key]; },
});

const planFixture = (id: string, name: string, updatedAt: number): LayoutPlan => ({
  id,
  name,
  createdAt: updatedAt - 1000,
  updatedAt,
  document: documentFixture(name),
});

describe('LocalPlanLibraryRepository', () => {
  it('migrates the legacy single layout into the first plan and removes the legacy key', async () => {
    const storage = memoryStorage({ [LEGACY_DOCUMENT_KEY]: documentFixture() });
    const repository = new LocalPlanLibraryRepository(storage);
    const plans = await repository.loadLibrary();
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe('legacy-layout');
    expect(plans[0].name).toBe('旧版本地布局');
    expect(plans[0].document.title).toBe('旧版本地布局');
    expect(storage.data[LEGACY_DOCUMENT_KEY]).toBeUndefined();
    expect((storage.data[PLAN_LIBRARY_KEY] as LayoutPlan[])).toHaveLength(1);
  });

  it('does not run migration again once the plan library exists', async () => {
    const existing = planFixture('plan-1', '已有方案', 2000);
    const storage = memoryStorage({ [PLAN_LIBRARY_KEY]: [existing], [LEGACY_DOCUMENT_KEY]: documentFixture('不应迁移') });
    const repository = new LocalPlanLibraryRepository(storage);
    const plans = await repository.loadLibrary();
    expect(plans.map((plan) => plan.id)).toEqual(['plan-1']);
    expect(storage.data[LEGACY_DOCUMENT_KEY]).toBeDefined();
  });

  it('ignores a damaged legacy document instead of replacing it with sample content', async () => {
    const storage = memoryStorage({ [LEGACY_DOCUMENT_KEY]: { version: 1, title: '损坏', elements: 'nope' } });
    const repository = new LocalPlanLibraryRepository(storage);
    expect(await repository.loadLibrary()).toEqual([]);
    expect(storage.data[LEGACY_DOCUMENT_KEY]).toBeDefined();
  });

  it('filters out corrupted plans while keeping the valid ones', async () => {
    const storage = memoryStorage({ [PLAN_LIBRARY_KEY]: [planFixture('good', '好方案', 1000), { id: 'bad' }] });
    const repository = new LocalPlanLibraryRepository(storage);
    const plans = await repository.loadLibrary();
    expect(plans.map((plan) => plan.id)).toEqual(['good']);
  });

  it('persists the whole plan library', async () => {
    const storage = memoryStorage();
    const repository = new LocalPlanLibraryRepository(storage);
    const plans = [planFixture('plan-1', '方案', 1000)];
    await repository.saveLibrary(plans);
    expect(storage.data[PLAN_LIBRARY_KEY]).toEqual(plans);
  });
});
