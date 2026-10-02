import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoot } from '../src/App';
import { ExpoSketchViewModel } from '../src/viewModel';
import type { LayoutPlan } from '../src/types';
import type { PlanLibraryRepository } from '../src/repository';

const planFixture = (id: string, name: string, updatedAt: number): LayoutPlan => ({
  id,
  name,
  createdAt: updatedAt - 100,
  updatedAt,
  document: {
    version: 1,
    title: name,
    field: { width: 24, height: 16 },
    elements: [
      { id: `${id}-entry`, kind: 'entrance', name: '入口', x: 1, y: 6, width: 2.5, height: 1.5, rotation: 0 },
      { id: `${id}-stage`, kind: 'stage', name: '舞台', x: 8, y: 2, width: 6, height: 3, rotation: 0 },
    ],
  },
});

const repository = (plans: LayoutPlan[]): PlanLibraryRepository => ({
  loadLibrary: vi.fn(async () => plans),
  saveLibrary: vi.fn(async () => {}),
});

const renderApp = async (vm: ExpoSketchViewModel) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<AppRoot vm={vm} />); });
  return { container, root };
};

describe('plan library UI flow', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('opens on the library, enters a plan, and guards dirty switches', async () => {
    const vm = new ExpoSketchViewModel(repository([planFixture('a', '一号展区', 3000), planFixture('b', '二号展区', 2000)]));
    await vm.initialize();
    const { container, root } = await renderApp(vm);

    expect(container.textContent).toContain('方案库');
    expect(container.textContent).toContain('一号展区');
    expect(container.textContent).toContain('二号展区');

    await act(async () => { vm.requestOpenPlan('a'); });
    expect(container.textContent).toContain('场地布局编辑器');

    await act(async () => { vm.addElement('booth'); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)); });
    expect(container.textContent).toContain('已自动保存');
    await act(async () => { vm.moveElement('a-stage', 10, 4); });
    expect(container.textContent).toContain('未保存');

    await act(async () => { vm.requestOpenPlan('b'); });
    expect(container.textContent).toContain('当前方案还有未保存的改动');
    expect(container.textContent).toContain('保存到当前方案并切换');
    expect(container.textContent).toContain('放弃改动并切换');

    await act(async () => { await vm.resolvePendingSwitch('discard'); });
    expect(container.textContent).not.toContain('当前方案还有未保存的改动');
    expect(vm.state.activePlanId).toBe('b');

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)); });
    await act(async () => { root.unmount(); });
  });

  it('renders an empty library with create actions and can create a blank plan', async () => {
    const vm = new ExpoSketchViewModel(repository([]));
    await vm.initialize();
    const { container, root } = await renderApp(vm);
    expect(container.textContent).toContain('还没有任何方案');
    await act(async () => { vm.requestCreatePlan('blank'); });
    expect(container.textContent).toContain('场地布局编辑器');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await act(async () => { root.unmount(); });
  });
});
