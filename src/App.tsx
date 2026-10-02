import { useState } from 'react';
import { AnalysisPanel } from './features/analysis-preview/AnalysisPanel';
import { StatusBar } from './features/analysis-preview/StatusBar';
import { ElementPalette } from './features/element-library/ElementPalette';
import { FieldSettingsPanel } from './features/field-setup/FieldSettingsPanel';
import { FieldCanvas } from './features/layout-editor/FieldCanvas';
import { InspectorPanel } from './features/layout-editor/InspectorPanel';
import { SchemeLibraryScreen } from './features/scheme-library/SchemeLibraryScreen';
import { TextPromptDialog, UnsavedSwitchDialog } from './features/scheme-library/SchemeDialogs';
import { useExpoSketchViewModel } from './hooks/useExpoSketchViewModel';

function LoadingScreen() {
  return <div className="loading-screen"><div className="loading-mark">✦</div><strong>正在打开 ExpoSketch</strong><span>加载方案库…</span></div>;
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return <div className="loading-screen"><div className="loading-mark">✦</div><strong>方案库读取失败</strong><span>本地数据暂时无法访问，方案内容没有被修改。</span><button type="button" className="library-new-button" onClick={onRetry}>重新加载</button></div>;
}

function App() {
  const { state, vm } = useExpoSketchViewModel();
  const [projectName, setProjectName] = useState('');
  const [saveAsOpen, setSaveAsOpen] = useState(false);

  if (state.phase === 'loading') return <LoadingScreen />;
  if (state.phase === 'error') return <ErrorScreen onRetry={() => void vm.retryLoad()} />;

  if (state.screen === 'library') {
    return <>
      <SchemeLibraryScreen
        summaries={state.summaries}
        sortKey={state.sortKey}
        onSortKeyChange={vm.setSortKey.bind(vm)}
        onCreate={(name) => void vm.createScheme(name)}
        onOpen={vm.requestOpenScheme.bind(vm)}
        onRename={(id, name) => void vm.renameScheme(id, name)}
        onDuplicate={(id, name) => void vm.duplicateScheme(id, name)}
        onDelete={(id) => void vm.deleteScheme(id)}
      />
      <SwitchGuard />
    </>;
  }

  const schemeName = state.activeScheme?.name ?? '未命名方案';

  return <>
    <div className="app-shell">
      <aside className="left-rail">
        <div className="brand"><div className="brand-mark">✦</div><div><strong>ExpoSketch</strong><span>SPACE PLANNER</span></div></div>
        <div className="project-heading"><span className="section-kicker">CURRENT SCHEME</span><input aria-label="方案名称" value={projectName || schemeName} onChange={(event) => setProjectName(event.target.value)} onBlur={() => { if (projectName.trim() && state.activeSchemeId) { void vm.renameScheme(state.activeSchemeId, projectName); } setProjectName(''); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></div>
        <div className="rail-divider" />
        <ElementPalette onAdd={vm.addElement.bind(vm)} />
        <div className="tips-card"><span className="tips-icon">⌘</span><div><strong>快速提示</strong><p>改动不会自动保存<br />离开前请点击“保存方案”</p></div></div>
        <div className="rail-footer"><span className="online-dot" />本地工作区 <span className="version">v0.2</span></div>
      </aside>
      <main className="main-stage">
        <header className="topbar">
          <div className="breadcrumb"><button type="button" className="library-link" onClick={vm.backToLibrary.bind(vm)}>‹ 方案库</button><b>/</b><strong>{schemeName}</strong>{state.isDirty ? <span className="dirty-chip">未保存</span> : null}</div>
          <div className="top-actions">
            <span className={`autosave-label ${state.isDirty ? 'is-dirty' : ''}`}><i />{state.isDirty ? '有改动待保存' : '已保存到方案库'}</span>
            <button type="button" className="secondary-save-button" onClick={() => setSaveAsOpen(true)}>另存为新方案 <span>＋</span></button>
            <button type="button" className={`share-button ${state.isDirty ? 'primary-save' : ''}`} disabled={!state.isDirty} onClick={() => void vm.saveCurrent()}>保存方案</button>
          </div>
        </header>
        <div className="workspace-heading"><div><span className="section-kicker">LAYOUT EDITOR / {state.activeSchemeId?.slice(-6).toUpperCase()}</span><h1>场地布局编辑器</h1><p>用拖放方式规划区域，保持主要通道畅通。</p></div><div className="heading-stats"><div><strong>{state.document.elements.length}</strong><span>元素</span></div><div><strong>{state.document.field.width}×{state.document.field.height}</strong><span>场地尺寸</span></div></div></div>
        <div className="editor-grid">
          <section className="canvas-panel"><div className="canvas-toolbar"><div className="toolbar-title"><span className="tool-grid">▦</span><div><strong>展厅平面图</strong><small>比例 1 : 100 · 单位：米</small></div></div><div className="toolbar-actions"><span className="zoom-label">⌕ 100%</span><button type="button" aria-label="更多布局选项">•••</button></div></div><FieldCanvas field={state.document.field} elements={state.renderElements} selectedId={state.selectedId} mode={state.mode} overlaps={state.analysis.overlaps} bounds={state.analysis.bounds} channels={state.analysis.channels} path={state.analysis.path} onSelect={vm.selectElement.bind(vm)} onMove={vm.moveElement.bind(vm)} /></section>
          <aside className="inspector"><InspectorPanel selectedElement={state.selectedElement} onRename={vm.renameSelected.bind(vm)} onResize={vm.resizeSelected.bind(vm)} onRotate={vm.rotateSelected.bind(vm)} onDelete={vm.removeSelected.bind(vm)} /><FieldSettingsPanel document={state.document} onResizeField={vm.resizeField.bind(vm)} onReset={vm.resetExample.bind(vm)} /></aside>
        </div>
        <AnalysisPanel analysis={state.analysis} mode={state.mode} elementCount={state.document.elements.length} />
        <StatusBar mode={state.mode} analysis={state.analysis} notice={state.notice} elementCount={state.document.elements.length} lastSavedAt={state.lastSavedAt} isDirty={state.isDirty} onModeChange={vm.setMode.bind(vm)} />
      </main>
    </div>
    {saveAsOpen ? <TextPromptDialog title="另存为新方案" description="当前工作区的布局将复制为一份完全独立的方案，并进入新方案继续编辑。" label="新方案名称" initialValue={`${schemeName} 副本`} submitLabel="另存并切换" onSubmit={(name) => { void vm.saveCurrentAs(name); setSaveAsOpen(false); }} onClose={() => setSaveAsOpen(false)} /> : null}
    <SwitchGuard />
  </>;

  function SwitchGuard() {
    const target = state.switchTargetId ? state.library.schemes.find((scheme) => scheme.id === state.switchTargetId) : null;
    const pendingCreate = state.pendingCreateName !== null;
    if ((!state.switchTargetId || !target) && !pendingCreate || !state.activeScheme) return null;
    return <UnsavedSwitchDialog
      currentName={state.activeScheme.name}
      targetName={target?.name ?? '新建空白方案'}
      onSave={() => void vm.confirmSaveAndSwitch()}
      onDiscard={() => void vm.confirmDiscardAndSwitch()}
      onCancel={vm.cancelSwitch.bind(vm)}
    />;
  }
}

export default App;
