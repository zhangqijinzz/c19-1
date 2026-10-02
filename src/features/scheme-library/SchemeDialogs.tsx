import { useEffect, useRef, useState } from 'react';

interface TextPromptDialogProps {
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  submitLabel: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export function TextPromptDialog({ title, description, label, initialValue = '', submitLabel, onSubmit, onClose }: TextPromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const submit = () => { if (value.trim()) onSubmit(value); };

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-card" role="dialog" aria-modal="true" aria-label={title}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      <label>{label}
        <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); if (event.key === 'Escape') onClose(); }} />
      </label>
      <div className="dialog-actions">
        <button type="button" className="dialog-ghost" onClick={onClose}>取消</button>
        <button type="button" className="dialog-primary" disabled={!value.trim()} onClick={submit}>{submitLabel}</button>
      </div>
    </div>
  </div>;
}

interface ConfirmDeleteDialogProps {
  name: string;
  isActive: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDeleteDialog({ name, isActive, onConfirm, onClose }: ConfirmDeleteDialogProps) {
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-card danger" role="dialog" aria-modal="true" aria-label="删除方案">
      <span className="dialog-icon">⌫</span>
      <h2>删除方案「{name}」？</h2>
      <p>{isActive ? '这是你正在编辑的方案，删除后会自动切换到方案库中另一个可用方案；没有其他方案时会新建空白方案。' : '删除后无法恢复，方案中的布局将一并移除。'}</p>
      <div className="dialog-actions">
        <button type="button" className="dialog-ghost" onClick={onClose}>取消</button>
        <button type="button" className="dialog-danger" onClick={onConfirm}>确认删除</button>
      </div>
    </div>
  </div>;
}

interface UnsavedSwitchDialogProps {
  currentName: string;
  targetName: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedSwitchDialog({ currentName, targetName, onSave, onDiscard, onCancel }: UnsavedSwitchDialogProps) {
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="dialog-card" role="dialog" aria-modal="true" aria-label="未保存的改动">
      <span className="dialog-icon warning">!</span>
      <h2>「{currentName}」还有没保存完的改动</h2>
      <p>切换到「{targetName}」前请明确选择：<strong>带过去</strong>会先把改动保存进「{currentName}」再切换，不会丢失；<strong>放弃</strong>则丢弃本次进入编辑器后的全部改动。</p>
      <div className="dialog-actions three">
        <button type="button" className="dialog-primary" onClick={onSave}>带过去（保存后切换）</button>
        <button type="button" className="dialog-danger-ghost" onClick={onDiscard}>放弃改动并切换</button>
        <button type="button" className="dialog-ghost" onClick={onCancel}>留在当前方案</button>
      </div>
    </div>
  </div>;
}
