import { useState } from 'react';
import { AnalysisPanel } from '../analysis-preview/AnalysisPanel';
import { StatusBar } from '../analysis-preview/StatusBar';
import { ElementPalette } from '../element-library/ElementPalette';
import { FieldSettingsPanel } from '../field-setup/FieldSettingsPanel';
import { FieldCanvas } from './FieldCanvas';
import { InspectorPanel } from './InspectorPanel';
import { SavePlanAsDialog } from '../plan-library/SavePlanAsDialog';
import type { ExpoSketchState, ExpoSketchViewModel } from '../../viewModel';

interface EditorScreenProps {
  state: ExpoSketchState;
  vm: ExpoSketchViewModel;
}

export function EditorScreen({ state, vm }: EditorScreenProps) {
  const [projectTitle, setProjectTitle] = useState('');
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const activePlan = vm.activePlan;

  return <>
    <div className="app-shell">
      <aside className="left-rail">
        <div className="brand"><div className="brand-mark">✦</div><div><strong>ExpoSketch</strong><span>SPACE PLANNER</span></div></div>
        <div className="project-heading"><span className="section-kicker">CURRENT PLAN</span><input aria-label="方案名称" value={projectTitle || state.document.title} onChange={(event) => setProjectTitle(event.target.value)} onBlur={() => { if (projectTitle.trim()) { vm.renameProject(projectTitle); setProjectTitle(''); } }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></div>
        <div className="rail-divider" />
        <ElementPalette onAdd={vm.addElement.bind(vm)} />
        <div className="tips-card"><span className="tips-icon">⌘</span><div><strong>快速提示</strong><p>拖动元素调整位置<br />检查模式查看通行风险</p></div></div>
        <div className="rail-footer"><span className="online-dot" />本地工作区 <span className="version">v0.2</span></div>
      </aside>
      <main className="main-stage">
        <header className="topbar"><div className="breadcrumb"><button type="button" className="breadcrumb-link" onClick={vm.backToLibrary.bind(vm)}>方案库</button><b>/</b><strong>{state.document.title}</strong>{state.isDirty ? <em className="unsaved-tag">未保存</em> : null}</div><div className="top-actions"><span className="autosave-label"><i className={state.isDirty ? 'pending' : state.isSaving ? 'saving' : ''} />{state.isSaving ? '正在保存…' : state.isDirty ? '改动待自动保存' : '已自动保存'}</span><button type="button" className="ghost-button" onClick={() => setSaveAsOpen(true)}>另存为方案 <span>⎘</span></button><button type="button" className="share-button">导出布局 <span>↗</span></button><button type="button" className="avatar-button">Z</button></div></header>
        <div className="workspace-heading"><div><span className="section-kicker">LAYOUT EDITOR / {activePlan?.id.slice(0, 8).toUpperCase() ?? 'PLAN'}</span><h1>场地布局编辑器</h1><p>用拖放方式规划区域，保持主要通道畅通。</p></div><div className="heading-stats"><div><strong>{state.document.elements.length}</strong><span>元素</span></div><div><strong>{state.document.field.width}×{state.document.field.height}</strong><span>场地尺寸</span></div></div></div>
        <div className="editor-grid">
          <section className="canvas-panel"><div className="canvas-toolbar"><div className="toolbar-title"><span className="tool-grid">▦</span><div><strong>展厅平面图</strong><small>比例 1 : 100 · 单位：米</small></div></div><div className="toolbar-actions"><span className="zoom-label">⌕ 100%</span><button type="button" aria-label="更多布局选项">•••</button></div></div><FieldCanvas field={state.document.field} elements={state.renderElements} selectedId={state.selectedId} mode={state.mode} overlaps={state.analysis.overlaps} bounds={state.analysis.bounds} channels={state.analysis.channels} path={state.analysis.path} onSelect={vm.selectElement.bind(vm)} onMove={vm.moveElement.bind(vm)} /></section>
          <aside className="inspector"><InspectorPanel selectedElement={state.selectedElement} onRename={vm.renameSelected.bind(vm)} onResize={vm.resizeSelected.bind(vm)} onRotate={vm.rotateSelected.bind(vm)} onDelete={vm.removeSelected.bind(vm)} /><FieldSettingsPanel document={state.document} onResizeField={vm.resizeField.bind(vm)} onReset={vm.resetExample.bind(vm)} /></aside>
        </div>
        <AnalysisPanel analysis={state.analysis} mode={state.mode} elementCount={state.document.elements.length} />
        <StatusBar mode={state.mode} analysis={state.analysis} notice={state.notice} elementCount={state.document.elements.length} lastSavedAt={state.lastSavedAt} onModeChange={vm.setMode.bind(vm)} />
      </main>
    </div>
    {saveAsOpen && activePlan ? <SavePlanAsDialog defaultName={`${activePlan.name} 副本`} existingNames={state.plans.map((plan) => plan.name)} onConfirm={(name) => { vm.savePlanAs(name); setSaveAsOpen(false); setProjectTitle(''); }} onCancel={() => setSaveAsOpen(false)} /> : null}
  </>;
}
