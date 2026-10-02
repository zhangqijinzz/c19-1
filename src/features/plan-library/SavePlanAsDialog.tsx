import { useEffect, useState } from 'react';

interface SavePlanAsDialogProps {
  defaultName: string;
  existingNames: string[];
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function SavePlanAsDialog({ defaultName, existingNames, onConfirm, onCancel }: SavePlanAsDialogProps) {
  const [name, setName] = useState(defaultName);
  const [touched, setTouched] = useState(false);
  const trimmed = name.trim();
  const duplicated = existingNames.includes(trimmed);
  const invalid = !trimmed;
  useEffect(() => { setName(defaultName); }, [defaultName]);

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="modal-card compact" role="dialog" aria-modal="true" aria-label="另存为方案">
      <span className="modal-icon subtle">✦</span>
      <h2>把当前布局另存为独立方案</h2>
      <p>当前布局（含未保存的改动）会复制成一个新方案，原方案保持不变。</p>
      <label className="modal-input">方案名称
        <input aria-label="新方案名称" value={name} autoFocus onChange={(event) => { setName(event.target.value); setTouched(true); }} onKeyDown={(event) => { if (event.key === 'Enter' && !invalid && !duplicated) onConfirm(trimmed); if (event.key === 'Escape') onCancel(); }} />
      </label>
      {touched && (invalid ? <small className="modal-error">请填写方案名称</small> : duplicated ? <small className="modal-error">已存在同名方案，请换一个名称</small> : null)}
      <div className="modal-actions">
        <button type="button" className="primary-button" disabled={invalid || duplicated} onClick={() => onConfirm(trimmed)}>创建方案</button>
        <button type="button" className="text-button" onClick={onCancel}>取消</button>
      </div>
    </div>
  </div>;
}
