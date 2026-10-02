import { useState } from 'react';
import { formatTimestamp } from '../../domain';
import type { SchemeSortKey, SchemeSummary } from '../../types';
import { ConfirmDeleteDialog, TextPromptDialog } from './SchemeDialogs';

type TextPromptKind =
  | { mode: 'new' }
  | { mode: 'rename'; id: string; name: string }
  | { mode: 'duplicate'; id: string; name: string };

interface SchemeLibraryScreenProps {
  summaries: SchemeSummary[];
  sortKey: SchemeSortKey;
  onSortKeyChange: (key: SchemeSortKey) => void;
  onCreate: (name?: string) => void;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string, name?: string) => void;
  onDelete: (id: string) => void;
}

export function SchemeLibraryScreen({ summaries, sortKey, onSortKeyChange, onCreate, onOpen, onRename, onDuplicate, onDelete }: SchemeLibraryScreenProps) {
  const [textPrompt, setTextPrompt] = useState<TextPromptKind | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SchemeSummary | null>(null);

  return <div className="library-screen">
    <header className="library-topbar">
      <div className="brand"><div className="brand-mark">✦</div><div><strong>ExpoSketch</strong><span>SPACE PLANNER</span></div></div>
      <button type="button" className="library-new-button" onClick={() => setTextPrompt({ mode: 'new' })}>＋ 新建空白方案</button>
    </header>
    <div className="library-content">
      <div className="library-heading">
        <div>
          <span className="section-kicker">SCHEME LIBRARY</span>
          <h1>方案库</h1>
          <p>把不同展区的布局各自存成独立方案，随时切换、复制或删除。</p>
        </div>
        <div className="sort-control" role="group" aria-label="方案排序方式">
          <button type="button" className={sortKey === 'updatedAt' ? 'active' : ''} onClick={() => onSortKeyChange('updatedAt')}>按修改时间</button>
          <button type="button" className={sortKey === 'name' ? 'active' : ''} onClick={() => onSortKeyChange('name')}>按名称</button>
        </div>
      </div>

      {summaries.length === 0 ? <div className="library-empty">
        <span>▦</span>
        <strong>方案库还是空的</strong>
        <p>新建一份空白方案，开始规划下一个展区。</p>
        <button type="button" className="library-new-button" onClick={() => setTextPrompt({ mode: 'new' })}>＋ 新建空白方案</button>
      </div> : <div className="scheme-grid">
        {summaries.map((scheme) => (
          <article key={scheme.id} className={`scheme-card ${scheme.isActive ? 'is-active' : ''}`}>
            <div className="scheme-card-head">
              <span className="scheme-symbol">▦</span>
              <div className="scheme-titles">
                <strong title={scheme.name}>{scheme.name}</strong>
                <small>修改于 {formatTimestamp(scheme.updatedAt)}</small>
              </div>
              {scheme.isActive ? <span className="scheme-active-tag">{scheme.isDirty ? '编辑中 · 未保存' : '编辑中'}</span> : null}
            </div>
            <p className="scheme-meta"><span>{scheme.elementCount} 个元素</span><span>{scheme.fieldLabel}</span><span>创建于 {formatTimestamp(scheme.createdAt)}</span></p>
            <div className="scheme-card-actions">
              <button type="button" className="scheme-open-button" onClick={() => onOpen(scheme.id)}>{scheme.isActive ? '继续编辑' : '打开方案'}</button>
              <div className="scheme-icon-actions">
                <button type="button" aria-label={`重命名方案 ${scheme.name}`} title="重命名" onClick={() => setTextPrompt({ mode: 'rename', id: scheme.id, name: scheme.name })}>✎</button>
                <button type="button" aria-label={`复制方案 ${scheme.name}`} title="复制" onClick={() => setTextPrompt({ mode: 'duplicate', id: scheme.id, name: scheme.name })}>❏</button>
                <button type="button" className="danger" aria-label={`删除方案 ${scheme.name}`} title="删除" onClick={() => setDeleteTarget(scheme)}>⌫</button>
              </div>
            </div>
          </article>
        ))}
      </div>}
    </div>

    {textPrompt?.mode === 'new' ? <TextPromptDialog title="新建空白方案" label="方案名称" initialValue="" submitLabel="创建并进入编辑" onSubmit={(name) => { onCreate(name); setTextPrompt(null); }} onClose={() => setTextPrompt(null)} /> : null}
    {textPrompt?.mode === 'rename' ? <TextPromptDialog title="重命名方案" label="方案名称" initialValue={textPrompt.name} submitLabel="保存名称" onSubmit={(name) => { onRename(textPrompt.id, name); setTextPrompt(null); }} onClose={() => setTextPrompt(null)} /> : null}
    {textPrompt?.mode === 'duplicate' ? <TextPromptDialog title="复制方案" description={`将以「${textPrompt.name}」的已保存内容为蓝本，创建一份完全独立的新方案。`} label="新方案名称" initialValue={`${textPrompt.name} 副本`} submitLabel="创建副本" onSubmit={(name) => { onDuplicate(textPrompt.id, name); setTextPrompt(null); }} onClose={() => setTextPrompt(null)} /> : null}
    {deleteTarget ? <ConfirmDeleteDialog name={deleteTarget.name} isActive={deleteTarget.isActive} onConfirm={() => { onDelete(deleteTarget.id); setDeleteTarget(null); }} onClose={() => setDeleteTarget(null)} /> : null}
  </div>;
}
