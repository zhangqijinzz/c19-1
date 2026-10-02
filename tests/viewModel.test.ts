import { describe, expect, it, vi } from 'vitest';
import { createStarterDocument } from '../src/domain';
import type { PlanLibraryRepository } from '../src/repository';
import type { LayoutDocument, LayoutPlan } from '../src/types';
import { ExpoSketchViewModel } from '../src/viewModel';

const plan = (id: string, name: string, overrides: Partial<LayoutPlan> = {}): LayoutPlan => {
  const document: LayoutDocument = {
    version: 1,
    title: name,
    field: { width: 24, height: 16 },
    elements: [
      { id: `${id}-entry`, kind: 'entrance', name: '入口', x: 1, y: 6, width: 2.5, height: 1.5, rotation: 0 },
      { id: `${id}-stage`, kind: 'stage', name: `${name}舞台`, x: 8, y: 2, width: 6, height: 3, rotation: 0 },
    ],
  };
  return { id, name, createdAt: 1000, updatedAt: 2000, ...overrides, document };
};

interface ControlledRepository extends PlanLibraryRepository {
  load: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  resolveSave: () => void;
  rejectSave: (error?: Error) => void;
}

const fakeRepository = (plans: LayoutPlan[] = [], loadError?: Error): ControlledRepository => {
  let saveWaiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const load = vi.fn(async () => {
    if (loadError) throw loadError;
    return plans;
  });
  const save = vi.fn(async (_updated: LayoutPlan[]) => new Promise<void>((resolve, reject) => {
    saveWaiters.push({ resolve, reject: reject as (error: Error) => void });
  }));
  return {
    load,
    save,
    loadLibrary: load,
    saveLibrary: (updated: LayoutPlan[]) => save(updated),
    resolveSave: () => { const waiters = saveWaiters; saveWaiters = []; waiters.forEach((waiter) => waiter.resolve()); },
    rejectSave: (error = new Error('quota')) => { const waiters = saveWaiters; saveWaiters = []; waiters.forEach((waiter) => waiter.reject(error)); },
  };
};

describe('ExpoSketchViewModel plan library', () => {
  it('starts on the library screen after loading', async () => {
    const repository = fakeRepository([plan('a', 'A 区'), plan('b', 'B 区')]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    expect(vm.state.phase).toBe('ready');
    expect(vm.state.screen).toBe('library');
    expect(vm.state.plans).toHaveLength(2);
  });

  it('shows an error phase when the library cannot be read', async () => {
    const vm = new ExpoSketchViewModel(fakeRepository([], new Error('bad storage')));
    await vm.initialize();
    expect(vm.state.phase).toBe('error');
    expect(vm.state.notice.tone).toBe('error');
  });

  it('opens a plan into the editor', async () => {
    const repository = fakeRepository([plan('a', 'A 区')]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.requestOpenPlan('a');
    expect(vm.state.screen).toBe('editor');
    expect(vm.state.activePlanId).toBe('a');
    expect(vm.state.document.title).toBe('A 区');
  });

  it('creates blank and example plans from the library', async () => {
    const repository = fakeRepository([]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.requestCreatePlan('blank');
    expect(vm.state.document.elements).toHaveLength(0);
    expect(vm.state.screen).toBe('editor');
    vm.backToLibrary();
    vm.requestCreatePlan('example');
    expect(vm.state.document.elements.length).toBe(createStarterDocument().elements.length);
  });

  it('sorts plans by modification time desc by default and supports name sorting', async () => {
    const repository = fakeRepository([plan('old', '旧方案', { updatedAt: 1000 }), plan('new', '新方案', { updatedAt: 5000 })]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    expect(vm.state.plans.map((item) => item.id)).toEqual(['new', 'old']);
    vm.setSort('name');
    expect(vm.state.plans.map((item) => item.name)).toEqual(['旧方案', '新方案']);
  });

  it('renames and duplicates plans', async () => {
    const repository = fakeRepository([plan('a', 'A 区')]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.renamePlan('a', '一号展区');
    expect(vm.state.plans[0].name).toBe('一号展区');
    vm.duplicatePlan('a');
    expect(vm.state.plans.map((item) => item.name)).toContain('一号展区 副本');
    expect(repository.save).toHaveBeenCalled();
  });

  it('falls back to another usable plan after deleting the active one', async () => {
    const repository = fakeRepository([
      plan('a', 'A 区', { updatedAt: 1000 }),
      plan('b', 'B 区', { updatedAt: 5000 }),
    ]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.requestOpenPlan('a');
    vm.deletePlan('a');
    expect(vm.state.screen).toBe('editor');
    expect(vm.state.activePlanId).toBe('b');
    expect(vm.state.document.title).toBe('B 区');
  });

  it('returns to the library with no active plan after deleting the last remaining plan', async () => {
    const repository = fakeRepository([plan('a', 'A 区')]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.requestOpenPlan('a');
    vm.deletePlan('a');
    expect(vm.state.screen).toBe('library');
    expect(vm.state.activePlanId).toBeNull();
    expect(vm.state.plans).toHaveLength(0);
  });

  it('asks before switching away from a dirty plan and saves when chosen', async () => {
    const repository = fakeRepository([plan('a', 'A 区'), plan('b', 'B 区')]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.requestOpenPlan('a');
    vm.addElement('booth');
    expect(vm.state.isDirty).toBe(true);
    vm.requestOpenPlan('b');
    expect(vm.state.pendingSwitch?.planId).toBe('b');
    expect(vm.state.activePlanId).toBe('a');
    const switchDone = vm.resolvePendingSwitch('save');
    expect(vm.state.isSwitching).toBe(true);
    repository.resolveSave();
    await switchDone;
    expect(vm.state.activePlanId).toBe('b');
    expect(vm.state.pendingSwitch).toBeNull();
    const calls = repository.save.mock.calls;
    const savedPlans = calls[calls.length - 1][0] as LayoutPlan[];
    expect(savedPlans.find((item) => item.id === 'a')?.document.elements.some((element) => element.kind === 'booth')).toBe(true);
  });

  it('discards unsaved edits when the user chooses to abandon them', async () => {
    const repository = fakeRepository([plan('a', 'A 区'), plan('b', 'B 区')]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.requestOpenPlan('a');
    const originalCount = vm.state.document.elements.length;
    vm.addElement('booth');
    vm.requestOpenPlan('b');
    await vm.resolvePendingSwitch('discard');
    expect(vm.state.activePlanId).toBe('b');
    vm.backToLibrary();
    vm.requestOpenPlan('a');
    expect(vm.state.document.elements).toHaveLength(originalCount);
  });

  it('keeps the user on the dirty plan when the switch is cancelled', async () => {
    const repository = fakeRepository([plan('a', 'A 区'), plan('b', 'B 区')]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.requestOpenPlan('a');
    vm.addElement('booth');
    vm.requestOpenPlan('b');
    vm.cancelPendingSwitch();
    expect(vm.state.pendingSwitch).toBeNull();
    expect(vm.state.activePlanId).toBe('a');
    expect(vm.state.isDirty).toBe(true);
  });

  it('stays on the dialog when saving during a switch fails', async () => {
    const repository = fakeRepository([plan('a', 'A 区'), plan('b', 'B 区')]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.requestOpenPlan('a');
    vm.addElement('booth');
    vm.requestOpenPlan('b');
    const switchDone = vm.resolvePendingSwitch('save');
    repository.rejectSave();
    await switchDone;
    expect(vm.state.activePlanId).toBe('a');
    expect(vm.state.pendingSwitch?.planId).toBe('b');
    expect(vm.state.notice.tone).toBe('error');
  });

  it('debounces autosave and clears the dirty flag once persisted', async () => {
    const repository = fakeRepository([plan('a', 'A 区')]);
    vi.useFakeTimers();
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.requestOpenPlan('a');
    vm.moveElement('a-stage', 9, 3);
    expect(vm.state.isDirty).toBe(true);
    expect(repository.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(repository.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(repository.save).toHaveBeenCalledTimes(1);
    repository.resolveSave();
    await vi.advanceTimersByTimeAsync(0);
    expect(vm.state.isDirty).toBe(false);
    vi.useRealTimers();
  });

  it('save as keeps the source plan unchanged and opens the new independent plan', async () => {
    const repository = fakeRepository([plan('a', 'A 区')]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.requestOpenPlan('a');
    vm.savePlanAs('双年展特装');
    expect(vm.state.activePlanId).not.toBe('a');
    expect(vm.state.document.title).toBe('双年展特装');
    const source = vm.state.plans.find((item) => item.id === 'a');
    expect(source?.name).toBe('A 区');
    expect(source?.document.title).toBe('A 区');
  });

  it('refuses blank names and auto-suffixes duplicate save-as names', async () => {
    const repository = fakeRepository([plan('a', 'A 区')]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.requestOpenPlan('a');
    vm.savePlanAs('   ');
    expect(vm.state.plans).toHaveLength(1);
    vm.savePlanAs('A 区');
    expect(vm.state.plans.map((item) => item.name).sort()).toEqual(['A 区', 'A 区 2']);
  });

  it('updates the analysis immediately while editing', async () => {
    const repository = fakeRepository([plan('a', 'A 区')]);
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.requestOpenPlan('a');
    vm.moveElement('a-stage', 1.2, 5.6);
    expect(vm.state.analysis.overlaps.length).toBeGreaterThan(0);
  });
});
