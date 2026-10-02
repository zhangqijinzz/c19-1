import { useMemo } from 'react';
import { EditorScreen } from './features/layout-editor/EditorScreen';
import { PlanLibraryPage } from './features/plan-library/PlanLibraryPage';
import { SwitchPlanDialog } from './features/plan-library/SwitchPlanDialog';
import { useExpoSketchViewModel } from './hooks/useExpoSketchViewModel';
import type { ExpoSketchViewModel } from './viewModel';

interface AppRootProps {
  vm: ExpoSketchViewModel;
}

export function AppRoot({ vm }: AppRootProps) {
  const { state } = useExpoSketchViewModel(vm);

  const dirtyPlanIds = useMemo(() => {
    const ids = new Set<string>();
    if (state.isDirty && state.activePlanId) ids.add(state.activePlanId);
    return ids;
  }, [state.isDirty, state.activePlanId]);

  if (state.phase === 'loading') {
    return <div className="loading-screen"><div className="loading-mark">✦</div><strong>正在打开 ExpoSketch</strong><span>读取本地方案库…</span></div>;
  }

  if (state.phase === 'error') {
    return <div className="loading-screen"><div className="loading-mark error">!</div><strong>方案库读取失败</strong><span>{state.notice.message}</span><button type="button" className="primary-button retry-button" onClick={vm.retryInitialize.bind(vm)}>重新加载</button></div>;
  }

  return <>
    {state.screen === 'library' || !state.activePlanId
      ? <PlanLibraryPage vm={vm} plans={state.plans} sort={state.sort} activePlanId={state.activePlanId} dirtyPlanIds={dirtyPlanIds} />
      : <EditorScreen state={state} vm={vm} />}
    {state.pendingSwitch ? <SwitchPlanDialog targetName={vm.pendingSwitchTargetName} currentName={state.document.title} isSaving={state.isSwitching} onSave={() => void vm.resolvePendingSwitch('save')} onDiscard={() => void vm.resolvePendingSwitch('discard')} onCancel={vm.cancelPendingSwitch.bind(vm)} /> : null}
  </>;
}

function App() {
  const { vm } = useExpoSketchViewModel();
  return <AppRoot vm={vm} />;
}

export default App;
