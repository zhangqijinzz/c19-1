import { describe, expect, it, vi } from 'vitest';
import { createSchemeFromDocument, createStarterDocument, sortSchemes } from '../src/domain';
import type { SchemeRepository } from '../src/repository';
import type { LayoutScheme, SchemeLibrary } from '../src/types';
import { ExpoSketchViewModel } from '../src/viewModel';

const scheme = (name: string, overrides: Partial<LayoutScheme> = {}): LayoutScheme => ({
  ...createSchemeFromDocument(createStarterDocument(), name),
  id: overrides.id ?? `scheme-${name}`,
  name,
  ...overrides,
});

const fakeRepository = (initial: SchemeLibrary = { version: 1, schemes: [scheme('方案甲')] }): SchemeRepository & { saved: () => SchemeLibrary | undefined } => {
  let stored: SchemeLibrary = JSON.parse(JSON.stringify(initial));
  return {
    async loadLibrary() { return JSON.parse(JSON.stringify(stored)); },
    async saveLibrary(library) { stored = JSON.parse(JSON.stringify(library)); },
    saved: () => stored,
  };
};

const boot = async (repository: SchemeRepository = fakeRepository()) => {
  const vm = new ExpoSketchViewModel(repository);
  await vm.initialize();
  return vm;
};

describe('ExpoSketchViewModel startup', () => {
  it('lands on the library screen instead of entering an editor directly', async () => {
    const vm = await boot();
    expect(vm.state.phase).toBe('ready');
    expect(vm.state.screen).toBe('library');
    expect(vm.state.activeSchemeId).toBeNull();
    expect(vm.state.summaries).toHaveLength(1);
  });

  it('enters an editor with the saved content when a scheme is opened', async () => {
    const vm = await boot();
    vm.requestOpenScheme('scheme-方案甲');
    expect(vm.state.screen).toBe('editor');
    expect(vm.state.document.title).toBe(createStarterDocument().title);
    expect(vm.state.isDirty).toBe(false);
  });

  it('shows the error phase when the repository fails', async () => {
    const repository: SchemeRepository = { loadLibrary: vi.fn(async () => { throw new Error('bad storage'); }), saveLibrary: vi.fn(async () => {}) };
    const vm = await boot(repository);
    expect(vm.state.phase).toBe('error');
  });
});

describe('scheme library ordering', () => {
  it('orders by modification time descending by default and by name on demand', async () => {
    const older = scheme('旧方案', { id: 'old', updatedAt: 1000, createdAt: 900 });
    const newer = scheme('新方案', { id: 'new', updatedAt: 3000, createdAt: 2900 });
    const middle = scheme('中方案', { id: 'mid', updatedAt: 2000, createdAt: 1900 });
    const repository = fakeRepository({ version: 1, schemes: [older, newer, middle] });
    const vm = await boot(repository);

    expect(vm.state.summaries.map((item) => item.id)).toEqual(['new', 'mid', 'old']);
    vm.setSortKey('name');
    expect(vm.state.summaries.map((item) => item.name)).toEqual(sortSchemes(vm.state.library.schemes, 'name').map((item) => item.name));
  });
});

describe('explicit saving and dirty tracking', () => {
  it('keeps edits in the working copy until save is called', async () => {
    const repository = fakeRepository();
    const vm = await boot(repository);
    vm.requestOpenScheme('scheme-方案甲');
    const before = vm.state.document.elements.length;

    vm.addElement('booth');
    expect(vm.state.isDirty).toBe(true);
    expect(repository.saved()?.schemes[0].document.elements).toHaveLength(before);

    await vm.saveCurrent();
    expect(vm.state.isDirty).toBe(false);
    expect(repository.saved()?.schemes[0].document.elements).toHaveLength(before + 1);
  });

  it('save current as a new independent scheme switches to the copy and leaves the source untouched', async () => {
    const repository = fakeRepository();
    const vm = await boot(repository);
    vm.requestOpenScheme('scheme-方案甲');
    vm.addElement('stage');
    await vm.saveCurrentAs('甲的另一个版本');

    expect(vm.state.screen).toBe('editor');
    expect(vm.state.activeScheme?.name).toBe('甲的另一个版本');
    expect(vm.state.isDirty).toBe(false);
    const saved = repository.saved()?.schemes ?? [];
    expect(saved).toHaveLength(2);
    expect(saved.find((item) => item.id === 'scheme-方案甲')?.document.elements).toHaveLength(createStarterDocument().elements.length);
  });

  it('does not persist when saving fails and keeps the working copy dirty', async () => {
    const repository: SchemeRepository = { loadLibrary: vi.fn(async () => ({ version: 1 as const, schemes: [scheme('方案甲')] })), saveLibrary: vi.fn(async () => { throw new Error('quota'); }) };
    const vm = await boot(repository);
    vm.requestOpenScheme('scheme-方案甲');
    vm.addElement('stage');
    expect(await vm.saveCurrent()).toBe(false);
    expect(vm.state.isDirty).toBe(true);
    expect(vm.state.notice.tone).toBe('error');
  });
});

describe('switching schemes with unsaved edits', () => {
  it('asks the user to carry over or discard instead of dropping edits silently', async () => {
    const repository = fakeRepository({ version: 1, schemes: [scheme('方案甲'), scheme('方案乙', { id: 'scheme-方案乙' })] });
    const vm = await boot(repository);
    vm.requestOpenScheme('scheme-方案甲');
    vm.addElement('booth');

    vm.requestOpenScheme('scheme-方案乙');
    expect(vm.state.switchTargetId).toBe('scheme-方案乙');
    expect(vm.state.document.elements.length).toBeGreaterThan(createStarterDocument().elements.length);

    await vm.confirmSaveAndSwitch();
    expect(vm.state.screen).toBe('editor');
    expect(vm.state.activeSchemeId).toBe('scheme-方案乙');
    expect(repository.saved()?.schemes.find((item) => item.id === 'scheme-方案甲')?.document.elements.length).toBeGreaterThan(createStarterDocument().elements.length);
  });

  it('discards edits when the user confirms discarding', async () => {
    const repository = fakeRepository({ version: 1, schemes: [scheme('方案甲'), scheme('方案乙', { id: 'scheme-方案乙' })] });
    const vm = await boot(repository);
    vm.requestOpenScheme('scheme-方案甲');
    const originalCount = vm.state.document.elements.length;
    vm.addElement('booth');
    vm.requestOpenScheme('scheme-方案乙');

    await vm.confirmDiscardAndSwitch();
    expect(vm.state.activeSchemeId).toBe('scheme-方案乙');
    expect(vm.state.document.elements).toHaveLength(originalCount);
    expect(repository.saved()?.schemes.find((item) => item.id === 'scheme-方案甲')?.document.elements).toHaveLength(originalCount);
  });

  it('stays on the current scheme after cancel', async () => {
    const repository = fakeRepository({ version: 1, schemes: [scheme('方案甲'), scheme('方案乙', { id: 'scheme-方案乙' })] });
    const vm = await boot(repository);
    vm.requestOpenScheme('scheme-方案甲');
    vm.addElement('booth');
    vm.requestOpenScheme('scheme-方案乙');

    vm.cancelSwitch();
    expect(vm.state.switchTargetId).toBeNull();
    expect(vm.state.activeSchemeId).toBe('scheme-方案甲');
    expect(vm.state.isDirty).toBe(true);
  });

  it('switches without prompting when there are no unsaved edits', async () => {
    const repository = fakeRepository({ version: 1, schemes: [scheme('方案甲'), scheme('方案乙', { id: 'scheme-方案乙' })] });
    const vm = await boot(repository);
    vm.requestOpenScheme('scheme-方案甲');
    vm.requestOpenScheme('scheme-方案乙');
    expect(vm.state.switchTargetId).toBeNull();
    expect(vm.state.activeSchemeId).toBe('scheme-方案乙');
  });

  it('returns to the library without discarding the working copy', async () => {
    const vm = await boot();
    vm.requestOpenScheme('scheme-方案甲');
    vm.addElement('booth');
    vm.backToLibrary();
    expect(vm.state.screen).toBe('library');
    expect(vm.state.summaries.find((item) => item.id === 'scheme-方案甲')?.isDirty).toBe(true);
    vm.requestOpenScheme('scheme-方案甲');
    expect(vm.state.isDirty).toBe(true);
  });

  it('also asks before creating a new scheme when edits are unsaved', async () => {
    const repository = fakeRepository();
    const vm = await boot(repository);
    vm.requestOpenScheme('scheme-方案甲');
    vm.addElement('booth');
    vm.backToLibrary();

    await vm.createScheme('新展区');
    expect(vm.state.pendingCreateName).toBe('新展区');
    expect(repository.saved()?.schemes).toHaveLength(1);

    await vm.confirmSaveAndSwitch();
    expect(vm.state.screen).toBe('editor');
    expect(vm.state.activeScheme?.name).toBe('新展区');
    expect(repository.saved()?.schemes).toHaveLength(2);
    expect(repository.saved()?.schemes.find((item) => item.id === 'scheme-方案甲')?.document.elements.length).toBeGreaterThan(createStarterDocument().elements.length);
  });

  it('discards edits then creates when the user chooses discard on a pending create', async () => {
    const vm = await boot();
    vm.requestOpenScheme('scheme-方案甲');
    vm.addElement('booth');
    vm.backToLibrary();
    await vm.createScheme('空白新方案');

    await vm.confirmDiscardAndSwitch();
    expect(vm.state.activeScheme?.name).toBe('空白新方案');
    expect(vm.state.document.elements).toHaveLength(0);
    expect(vm.state.isDirty).toBe(false);
  });
});

describe('scheme management', () => {
  it('creates a blank scheme, persists it and enters its editor', async () => {
    const repository = fakeRepository();
    const vm = await boot(repository);
    await vm.createScheme('B 馆方案');
    expect(vm.state.screen).toBe('editor');
    expect(vm.state.activeScheme?.name).toBe('B 馆方案');
    expect(vm.state.document.elements).toEqual([]);
    expect(repository.saved()?.schemes).toHaveLength(2);
  });

  it('duplicates a scheme as an independent deep copy', async () => {
    const source = scheme('原方案');
    const repository = fakeRepository({ version: 1, schemes: [source] });
    const vm = await boot(repository);
    await vm.duplicateScheme(source.id, '复制方案');

    const saved = repository.saved()?.schemes ?? [];
    expect(saved).toHaveLength(2);
    const copy = saved.find((item) => item.name === '复制方案');
    expect(copy).toBeDefined();
    expect(copy?.id).not.toBe(source.id);
    expect(copy?.document).toEqual(source.document);
    expect(copy?.document).not.toBe(source.document);
  });

  it('renames a scheme and bumps its modification time', async () => {
    const source = scheme('旧名字', { updatedAt: 1000 });
    const originalNow = Date.now;
    Date.now = () => 5000;
    const repository = fakeRepository({ version: 1, schemes: [source] });
    const vm = await boot(repository);
    await vm.renameScheme(source.id, '新名字');
    Date.now = originalNow;

    const renamed = repository.saved()?.schemes[0];
    expect(renamed?.name).toBe('新名字');
    expect(renamed?.updatedAt).toBe(5000);
  });

  it('ignores blank rename attempts', async () => {
    const repository = fakeRepository();
    const vm = await boot(repository);
    await vm.renameScheme('scheme-方案甲', '   ');
    expect(repository.saved()?.schemes[0].name).toBe('方案甲');
  });
});

describe('deleting schemes lands on a usable scheme', () => {
  it('switches to another scheme after deleting the one in use', async () => {
    const target = scheme('使用中', { id: 'active' });
    const other = scheme('另一个', { id: 'other', updatedAt: 9999 });
    const repository = fakeRepository({ version: 1, schemes: [target, other] });
    const vm = await boot(repository);
    vm.requestOpenScheme('active');
    await vm.deleteScheme('active');

    expect(vm.state.screen).toBe('editor');
    expect(vm.state.activeSchemeId).toBe('other');
    expect(vm.state.isDirty).toBe(false);
    expect(repository.saved()?.schemes.map((item) => item.id)).toEqual(['other']);
  });

  it('creates a usable blank scheme when the last scheme is deleted', async () => {
    const repository = fakeRepository();
    const vm = await boot(repository);
    vm.requestOpenScheme('scheme-方案甲');
    await vm.deleteScheme('scheme-方案甲');

    expect(vm.state.screen).toBe('editor');
    expect(vm.state.activeSchemeId).not.toBeNull();
    expect(vm.state.activeScheme?.name).toBe('未命名方案');
    expect(repository.saved()?.schemes).toHaveLength(1);
  });

  it('keeps the current editor open when deleting another scheme from the library', async () => {
    const repository = fakeRepository({ version: 1, schemes: [scheme('甲', { id: 'a' }), scheme('乙', { id: 'b' })] });
    const vm = await boot(repository);
    vm.requestOpenScheme('a');
    vm.backToLibrary();
    await vm.deleteScheme('b');
    expect(vm.state.screen).toBe('library');
    expect(vm.state.activeSchemeId).toBe('a');
  });
});

describe('editor mutations', () => {
  it('recomputes overlap analysis immediately after a move', async () => {
    const vm = await boot();
    vm.requestOpenScheme('scheme-方案甲');
    const stage = vm.state.document.elements.find((element) => element.kind === 'stage');
    vm.moveElement(stage!.id, 4.5, 2.5);
    expect(vm.state.analysis.overlaps.length).toBeGreaterThan(0);
  });

  it('ignores invalid field dimensions', async () => {
    const vm = await boot();
    vm.requestOpenScheme('scheme-方案甲');
    const before = vm.state.document.field.width;
    vm.resizeField(1, 1);
    expect(vm.state.document.field.width).toBe(before);
  });

  it('loads the starter example into the working copy without overwriting the saved scheme', async () => {
    const custom: LayoutScheme = createSchemeFromDocument({ version: 1, title: '自定义', field: { width: 20, height: 14 }, elements: [] }, '空白自定义');
    const repository = fakeRepository({ version: 1, schemes: [custom] });
    const vm = await boot(repository);
    vm.requestOpenScheme(custom.id);
    expect(vm.state.document.elements).toHaveLength(0);

    vm.resetExample();
    expect(vm.state.isDirty).toBe(true);
    expect(vm.state.document.elements.length).toBeGreaterThan(0);
    expect(repository.saved()?.schemes[0].document.elements).toHaveLength(0);
  });
});
