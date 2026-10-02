interface SwitchPlanDialogProps {
  targetName: string;
  currentName: string;
  isSaving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function SwitchPlanDialog({ targetName, currentName, isSaving, onSave, onDiscard, onCancel }: SwitchPlanDialogProps) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!isSaving && event.target === event.currentTarget) onCancel(); }}>
    <div className="modal-card" role="dialog" aria-modal="true" aria-label="未保存的改动">
      <span className="modal-icon">!</span>
      <h2>当前方案还有未保存的改动</h2>
      <p>「{currentName}」中的修改尚未写入方案库。切换到「{targetName}」前，请选择如何处理这些改动——放弃后无法恢复。</p>
      <div className="modal-actions">
        <button type="button" className="primary-button" disabled={isSaving} onClick={onSave}>{isSaving ? '正在保存…' : '保存到当前方案并切换'}</button>
        <button type="button" className="ghost-button danger" disabled={isSaving} onClick={onDiscard}>放弃改动并切换</button>
        <button type="button" className="text-button" disabled={isSaving} onClick={onCancel}>继续编辑当前方案</button>
      </div>
    </div>
  </div>;
}
