import { useState } from 'react';
import type { ExpoSketchViewModel } from '../../viewModel';
import type { LayoutPlan, PlanSort } from '../../types';

interface PlanLibraryPageProps {
  vm: ExpoSketchViewModel;
  plans: LayoutPlan[];
  sort: PlanSort;
  activePlanId: string | null;
  dirtyPlanIds: Set<string>;
}

const formatUpdatedAt = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export function PlanLibraryPage({ vm, plans, sort, activePlanId, dirtyPlanIds }: PlanLibraryPageProps) {
  return <div className="library-screen">
    <header className="library-topbar">
      <div className="brand"><div className="brand-mark">✦</div><div><strong>ExpoSketch</strong><span>SPACE PLANNER</span></div></div>
      <div className="library-top-actions">
        <button type="button" className="ghost-button" onClick={() => vm.requestCreatePlan('blank')}>+ 空白方案</button>
        <button type="button" className="primary-button" onClick={() => vm.requestCreatePlan('example')}>从示例新建</button>
      </div>
    </header>
    <div className="library-content">
      <div className="library-heading">
        <div>
          <span className="section-kicker">PLAN LIBRARY</span>
          <h1>方案库</h1>
          <p>每个方案独立保存，可同时推进多个展区；打开软件先在这里选择要继续的方案。</p>
        </div>
        <div className="sort-toggle" role="group" aria-label="方案排序">
          <button type="button" className={sort === 'updated' ? 'active' : ''} onClick={() => vm.setSort('updated')}>按修改时间</button>
          <button type="button" className={sort === 'name' ? 'active' : ''} onClick={() => vm.setSort('name')}>按名称</button>
        </div>
      </div>
      {plans.length === 0
        ? <div className="library-empty"><span className="empty-mark">▦</span><strong>还没有任何方案</strong><p>新建空白方案，或从示例布局开始第一个展区规划。</p><div className="empty-actions"><button type="button" className="ghost-button" onClick={() => vm.requestCreatePlan('blank')}>+ 空白方案</button><button type="button" className="primary-button" onClick={() => vm.requestCreatePlan('example')}>从示例新建</button></div></div>
        : <div className="plan-grid">{plans.map((plan) => <PlanCard key={plan.id} plan={plan} vm={vm} isActive={plan.id === activePlanId} isDirty={dirtyPlanIds.has(plan.id)} />)}</div>}
    </div>
  </div>;
}

interface PlanCardProps {
  plan: LayoutPlan;
  vm: ExpoSketchViewModel;
  isActive: boolean;
  isDirty: boolean;
}

function PlanCard({ plan, vm, isActive, isDirty }: PlanCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(plan.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { width, height } = plan.document.field;

  const commitRename = () => {
    vm.renamePlan(plan.id, draftName);
    setDraftName(plan.name);
    setEditing(false);
  };

  return <article className={`plan-card${isActive ? ' is-active' : ''}`}>
    <button type="button" className="plan-card-open" onClick={() => vm.requestOpenPlan(plan.id)}>
      <span className="plan-card-eyebrow"><span className="section-kicker">LAYOUT PLAN</span>{isDirty ? <em className="dirty-badge">未保存</em> : isActive ? <em className="active-badge">使用中</em> : null}</span>
      <span className="plan-card-title">{plan.name}</span>
      <span className="plan-card-thumb"><span className="thumb-grid" />{plan.document.elements.slice(0, 8).map((element) => <i key={element.id} style={{ left: `${Math.min(92, element.x / width * 100)}%`, top: `${Math.min(88, element.y / height * 100)}%`, width: `${Math.max(8, element.width / width * 100)}%`, height: `${Math.max(6, element.height / height * 100)}%` }} />)}</span>
      <span className="plan-card-meta"><span>{plan.document.elements.length} 个元素</span><span>{width} × {height} m</span><span>修改于 {formatUpdatedAt(plan.updatedAt)}</span></span>
    </button>
    <div className="plan-card-actions">
      {editing ? (
        <span className="rename-row">
          <input aria-label="方案名称" value={draftName} autoFocus onChange={(event) => setDraftName(event.target.value)} onBlur={commitRename} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setDraftName(plan.name); setEditing(false); } }} />
        </span>
      ) : confirmingDelete ? (
        <span className="delete-confirm"><strong>确认删除？</strong><button type="button" className="danger-text" onClick={() => vm.deletePlan(plan.id)}>删除</button><button type="button" onClick={() => setConfirmingDelete(false)}>取消</button></span>
      ) : (
        <>
          <button type="button" onClick={() => { setDraftName(plan.name); setEditing(true); }}>重命名</button>
          <button type="button" onClick={() => vm.duplicatePlan(plan.id)}>复制</button>
          <button type="button" className="danger-text" onClick={() => setConfirmingDelete(true)}>删除</button>
        </>
      )}
    </div>
  </article>;
}
