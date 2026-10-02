import { analyzeLayout, cloneDocument, createBlankDocument, createElement, createStarterDocument, createUniqueName, findElement, getBoundingBox, normalizeRotation } from './domain';
import type { PlanLibraryRepository } from './repository';
import type { Analysis, ElementKind, LayoutDocument, LayoutMode, LayoutPlan, Notice, PendingSwitch, PlanSort, RenderElement, ViewPhase, ViewScreen } from './types';

export interface ExpoSketchState {
  phase: ViewPhase;
  screen: ViewScreen;
  sort: PlanSort;
  plans: LayoutPlan[];
  activePlanId: string | null;
  document: LayoutDocument;
  renderElements: RenderElement[];
  selectedId: string | null;
  selectedElement: RenderElement | null;
  mode: LayoutMode;
  analysis: Analysis;
  notice: Notice;
  lastSavedAt: number | null;
  isDirty: boolean;
  isSaving: boolean;
  isSwitching: boolean;
  pendingSwitch: PendingSwitch | null;
}

const AUTOSAVE_DELAY = 500;

const toRenderElements = (document: LayoutDocument): RenderElement[] => document.elements.map((element) => {
  const box = getBoundingBox(element);
  return { ...element, displayWidth: box.width, displayHeight: box.height, occupiedArea: Number((box.width * box.height).toFixed(1)) };
});

const starter = createStarterDocument();
const starterRenderElements = toRenderElements(starter);

const createPlanId = () => `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const sortPlans = (plans: LayoutPlan[], sort: PlanSort): LayoutPlan[] =>
  [...plans].sort((first, second) =>
    sort === 'name'
      ? first.name.localeCompare(second.name, 'zh-Hans-CN') || second.updatedAt - first.updatedAt
      : second.updatedAt - first.updatedAt || first.name.localeCompare(second.name, 'zh-Hans-CN'));

type Listener = () => void;

export class ExpoSketchViewModel {
  private listeners = new Set<Listener>();
  private stateValue: ExpoSketchState = {
    phase: 'loading',
    screen: 'library',
    sort: 'updated',
    plans: [],
    activePlanId: null,
    document: starter,
    renderElements: starterRenderElements,
    selectedId: 'stage-1',
    selectedElement: starterRenderElements.find((element) => element.id === 'stage-1') ?? null,
    mode: 'edit',
    analysis: analyzeLayout(starter),
    notice: { tone: 'info', message: '正在打开方案库…' },
    lastSavedAt: null,
    isDirty: false,
    isSaving: false,
    isSwitching: false,
    pendingSwitch: null,
  };

  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private writeToken = 0;
  private savedDocument: LayoutDocument | null = null;

  constructor(private readonly repository: PlanLibraryRepository) {}

  get state() { return this.stateValue; }

  get activePlan(): LayoutPlan | null {
    return this.stateValue.plans.find((plan) => plan.id === this.stateValue.activePlanId) ?? null;
  }

  get pendingSwitchTargetName(): string {
    const pending = this.stateValue.pendingSwitch;
    if (!pending) return '';
    if (pending.type === 'create') return pending.createMode === 'example' ? '示例方案' : '空白方案';
    return this.stateValue.plans.find((plan) => plan.id === pending.planId)?.name ?? '目标方案';
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async initialize() {
    try {
      const plans = await this.repository.loadLibrary();
      this.commit({
        phase: 'ready',
        plans,
        isDirty: false,
        isSaving: false,
        pendingSwitch: null,
        notice: plans.length ? { tone: 'success', message: `方案库已载入，共 ${plans.length} 个方案` } : { tone: 'info', message: '方案库还是空的，新建第一个方案开始规划' },
      });
    } catch {
      this.commit({ phase: 'error', notice: { tone: 'error', message: '方案库读取失败，请检查本地存储权限后重试' } });
    }
  }

  retryInitialize() {
    this.commit({ phase: 'loading', notice: { tone: 'info', message: '正在重新打开方案库…' } });
    void this.initialize();
  }

  setSort(sort: PlanSort) { this.commit({ sort }); }

  requestOpenPlan(planId: string) {
    if (this.stateValue.isSwitching) return;
    if (planId === this.stateValue.activePlanId) {
      this.commit({ screen: 'editor', pendingSwitch: null });
      return;
    }
    this.guardSwitch({ type: 'open', planId });
  }

  requestCreatePlan(mode: 'blank' | 'example') {
    if (this.stateValue.isSwitching) return;
    this.guardSwitch({ type: 'create', createMode: mode });
  }

  backToLibrary() {
    if (this.stateValue.isSwitching) return;
    this.commit({ screen: 'library', pendingSwitch: null });
  }

  async resolvePendingSwitch(action: 'save' | 'discard') {
    const pending = this.stateValue.pendingSwitch;
    if (!pending || this.stateValue.isSwitching) return;
    if (pending.type === 'open' && !this.stateValue.plans.some((plan) => plan.id === pending.planId)) {
      this.commit({ pendingSwitch: null, notice: { tone: 'warning', message: '目标方案已不存在，请重新选择' } });
      return;
    }
    if (action === 'save') {
      const saved = await this.persistActive(true);
      if (!saved) return;
    } else {
      this.discardActiveEdits();
    }
    if (pending.type === 'open' && pending.planId) this.openPlan(pending.planId);
    else this.createPlan(pending.createMode ?? 'blank');
  }

  cancelPendingSwitch() {
    if (this.stateValue.isSwitching) return;
    this.commit({ pendingSwitch: null });
  }

  savePlanAs(name: string) {
    const trimmed = name.trim();
    if (!trimmed || !this.stateValue.activePlanId || this.stateValue.isSwitching) return;
    const now = Date.now();
    const plan: LayoutPlan = {
      id: createPlanId(),
      name: createUniqueName(trimmed, this.stateValue.plans.map((item) => item.name)),
      createdAt: now,
      updatedAt: now,
      document: { ...this.stateValue.document, title: trimmed },
    };
    this.cancelScheduledSave();
    this.savedDocument = cloneDocument(plan.document);
    this.commit({
      plans: [...this.stateValue.plans, plan],
      activePlanId: plan.id,
      document: plan.document,
      screen: 'editor',
      pendingSwitch: null,
      isDirty: false,
      isSaving: false,
      isSwitching: false,
      lastSavedAt: now,
      selectedId: plan.document.elements[0]?.id ?? null,
      mode: 'edit',
      notice: { tone: 'success', message: `已另存为新方案「${plan.name}」，原方案保持不变` },
    });
    void this.writeLibrary();
  }

  duplicatePlan(planId: string) {
    const source = this.stateValue.plans.find((plan) => plan.id === planId);
    if (!source) return;
    const now = Date.now();
    const name = createUniqueName(`${source.name} 副本`, this.stateValue.plans.map((plan) => plan.name));
    const copy: LayoutPlan = {
      id: createPlanId(),
      name,
      createdAt: now,
      updatedAt: now,
      document: { ...cloneDocument(source.document), title: name },
    };
    this.commit({ plans: [...this.stateValue.plans, copy], notice: { tone: 'success', message: `已复制方案「${source.name}」` } });
    void this.writeLibrary();
  }

  renamePlan(planId: string, name: string) {
    const trimmed = name.trim();
    const target = this.stateValue.plans.find((plan) => plan.id === planId);
    if (!trimmed || !target || target.name === trimmed) return;
    if (planId === this.stateValue.activePlanId && this.stateValue.isSaving) return;
    const unique = createUniqueName(trimmed, this.stateValue.plans.filter((plan) => plan.id !== planId).map((plan) => plan.name));
    const plans = this.stateValue.plans.map((plan) => plan.id === planId
      ? { ...plan, name: unique, document: { ...plan.document, title: unique } }
      : plan);
    const patch: Partial<ExpoSketchState> = { plans, notice: { tone: 'success', message: `方案已重命名为「${unique}」` } };
    if (planId === this.stateValue.activePlanId) {
      const renamedDocument = plans.find((item) => item.id === planId)!.document;
      patch.document = renamedDocument;
      if (!this.stateValue.isDirty) this.savedDocument = cloneDocument(renamedDocument);
    }
    this.commit(patch);
    void this.writeLibrary();
  }

  deletePlan(planId: string) {
    const removed = this.stateValue.plans.find((plan) => plan.id === planId);
    if (!removed || this.stateValue.isSwitching) return;
    const remaining = this.stateValue.plans.filter((plan) => plan.id !== planId);
    const wasActive = planId === this.stateValue.activePlanId;
    if (wasActive) this.cancelScheduledSave();

    if (wasActive && remaining.length > 0) {
      const fallback = sortPlans(remaining, 'updated')[0];
      this.openPlan(fallback.id, remaining, { tone: 'info', message: `「${removed.name}」已删除，已切换到仍可用的「${fallback.name}」` });
      return;
    }

    if (wasActive) {
      this.commit({
        plans: remaining,
        activePlanId: null,
        screen: 'library',
        pendingSwitch: null,
        isDirty: false,
        isSaving: false,
        notice: { tone: 'info', message: `「${removed.name}」已删除，方案库已空，可新建方案` },
      });
      void this.writeLibrary();
      return;
    }

    this.commit({ plans: remaining, notice: { tone: 'info', message: `「${removed.name}」已删除` } });
    void this.writeLibrary();
  }

  selectElement(id: string) { this.commit({ selectedId: id }); }

  setMode(mode: LayoutMode) { this.commit({ mode, notice: { tone: 'info', message: mode === 'inspect' ? '检查模式已开启：拖动元素查看即时提示' : mode === 'path' ? '路径模式已开启：入口到重点区域的访问路线已生成' : '编辑模式已开启' } }); }

  addElement(kind: ElementKind) {
    const element = createElement(kind, this.stateValue.document.elements.length, this.stateValue.document.field);
    this.editDocument({ ...this.stateValue.document, elements: [...this.stateValue.document.elements, element] }, { selectedId: element.id, notice: { tone: 'success', message: `${element.name} 已加入场地` } });
  }

  removeSelected() {
    if (!this.stateValue.selectedId) return;
    const removed = findElement(this.stateValue.document, this.stateValue.selectedId);
    const elements = this.stateValue.document.elements.filter((element) => element.id !== this.stateValue.selectedId);
    this.editDocument({ ...this.stateValue.document, elements }, { selectedId: elements[0]?.id ?? null, notice: { tone: 'info', message: `${removed?.name ?? '元素'} 已移除` } });
  }

  moveElement(id: string, x: number, y: number) {
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) } : element);
    this.editDocument({ ...this.stateValue.document, elements });
  }

  resizeSelected(width: number, height: number) {
    const id = this.stateValue.selectedId;
    if (!id || width <= 0 || height <= 0) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, width: Number(width.toFixed(1)), height: Number(height.toFixed(1)) } : element);
    this.editDocument({ ...this.stateValue.document, elements });
  }

  rotateSelected() {
    const id = this.stateValue.selectedId;
    if (!id) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, rotation: normalizeRotation(element.rotation + 90) } : element);
    this.editDocument({ ...this.stateValue.document, elements }, { notice: { tone: 'info', message: '方向已旋转 90°' } });
  }

  renameSelected(name: string) {
    const id = this.stateValue.selectedId;
    if (!id || !name.trim()) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, name: name.trim() } : element);
    this.editDocument({ ...this.stateValue.document, elements });
  }

  resizeField(width: number, height: number) {
    if (width < 12 || height < 10) return;
    this.editDocument({ ...this.stateValue.document, field: { width: Number(width.toFixed(1)), height: Number(height.toFixed(1)) } }, { notice: { tone: 'success', message: '场地尺寸已更新' } });
  }

  renameProject(title: string) {
    const trimmed = title.trim();
    const activeId = this.stateValue.activePlanId;
    if (!trimmed || !activeId) return;
    this.renamePlan(activeId, trimmed);
  }

  resetExample() {
    const document = createStarterDocument();
    this.editDocument(document, { selectedId: 'stage-1', mode: 'edit', notice: { tone: 'success', message: '已在当前方案中恢复示例布局' } });
  }

  private guardSwitch(pending: PendingSwitch) {
    if (!this.stateValue.isDirty) {
      if (pending.type === 'open' && pending.planId) this.openPlan(pending.planId);
      else this.createPlan(pending.createMode ?? 'blank');
      return;
    }
    this.commit({ pendingSwitch: pending });
  }

  private createPlan(mode: 'blank' | 'example') {
    const now = Date.now();
    const base = mode === 'example' ? createStarterDocument() : createBlankDocument();
    const defaultName = mode === 'example' ? '示例布局方案' : '未命名方案';
    const name = createUniqueName(defaultName, this.stateValue.plans.map((plan) => plan.name));
    const plan: LayoutPlan = { id: createPlanId(), name, createdAt: now, updatedAt: now, document: { ...base, title: name } };
    this.cancelScheduledSave();
    this.savedDocument = cloneDocument(plan.document);
    this.commit({
      plans: [...this.stateValue.plans, plan],
      activePlanId: plan.id,
      document: plan.document,
      screen: 'editor',
      pendingSwitch: null,
      isDirty: false,
      isSaving: false,
      isSwitching: false,
      lastSavedAt: now,
      selectedId: plan.document.elements[0]?.id ?? null,
      mode: 'edit',
      notice: { tone: 'success', message: `已创建方案「${name}」` },
    });
    void this.writeLibrary();
  }

  private openPlan(planId: string, plansOverride?: LayoutPlan[], notice?: Notice) {
    const plans = plansOverride ?? this.stateValue.plans;
    const target = plans.find((plan) => plan.id === planId);
    if (!target) return;
    this.cancelScheduledSave();
    this.savedDocument = cloneDocument(target.document);
    this.commit({
      plans,
      activePlanId: target.id,
      document: target.document,
      screen: 'editor',
      pendingSwitch: null,
      isDirty: false,
      isSaving: false,
      isSwitching: false,
      lastSavedAt: target.updatedAt,
      selectedId: target.document.elements[0]?.id ?? null,
      mode: 'edit',
      notice: notice ?? { tone: 'success', message: `已打开方案「${target.name}」` },
    });
    if (plansOverride) void this.writeLibrary();
  }

  private discardActiveEdits() {
    const activeId = this.stateValue.activePlanId;
    if (!this.savedDocument || !activeId) return;
    const restored = cloneDocument(this.savedDocument);
    this.cancelScheduledSave();
    const plans = this.stateValue.plans.map((plan) => plan.id === activeId
      ? { ...plan, document: restored }
      : plan);
    this.commit({ plans, document: restored, isDirty: false, isSaving: false });
  }

  private editDocument(document: LayoutDocument, patch: Partial<ExpoSketchState> = {}) {
    const activeId = this.stateValue.activePlanId;
    if (!activeId) return;
    const now = Date.now();
    const plans = this.stateValue.plans.map((plan) => {
      if (plan.id !== activeId) return plan;
      const nextPlan = { ...plan, updatedAt: now, document };
      return nextPlan;
    });
    this.commit({ ...patch, plans, document, isDirty: true });
    this.scheduleAutosave();
  }

  private scheduleAutosave() {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.persistActive(false);
    }, AUTOSAVE_DELAY);
  }

  private cancelScheduledSave() {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this.writeToken += 1;
  }

  private async persistActive(switching: boolean): Promise<boolean> {
    const activeId = this.stateValue.activePlanId;
    if (!activeId) return false;
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    const snapshot = this.stateValue.document;
    const now = Date.now();
    const plans = this.stateValue.plans.map((plan) => plan.id === activeId ? { ...plan, updatedAt: now, document: snapshot } : plan);
    const token = ++this.writeToken;
    this.commit({ plans, isSaving: true, isSwitching: switching });
    try {
      await this.repository.saveLibrary(sortPlans(plans, this.stateValue.sort));
      if (token !== this.writeToken) return true;
      this.savedDocument = cloneDocument(snapshot);
      this.commit({ lastSavedAt: now, isDirty: false, isSaving: false, isSwitching: false, notice: switching ? { tone: 'success', message: '改动已保存到当前方案' } : this.stateValue.notice });
      return true;
    } catch {
      if (token !== this.writeToken) return true;
      this.commit({
        isSaving: false,
        isSwitching: false,
        notice: { tone: 'error', message: switching ? '保存失败，无法带改动切换；可重试或选择放弃改动' : '自动保存失败，改动仍保留在页面中' },
      });
      return false;
    }
  }

  private async writeLibrary() {
    try {
      await this.repository.saveLibrary(sortPlans(this.stateValue.plans, this.stateValue.sort));
    } catch {
      this.commit({ notice: { tone: 'error', message: '方案库写入失败，请稍后重试' } });
    }
  }

  private commit(patch: Partial<ExpoSketchState>) {
    const next = { ...this.stateValue, ...patch };
    next.plans = sortPlans(next.plans, next.sort);
    const hasActiveDocument = next.plans.some((plan) => plan.id === next.activePlanId);
    const renderElements = hasActiveDocument ? toRenderElements(next.document) : next.renderElements;
    this.stateValue = {
      ...next,
      renderElements,
      selectedElement: renderElements.find((element) => element.id === next.selectedId) ?? null,
      analysis: hasActiveDocument ? analyzeLayout(next.document) : next.analysis,
    };
    this.listeners.forEach((listener) => listener());
  }
}
