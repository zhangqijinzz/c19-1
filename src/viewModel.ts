import {
  analyzeLayout,
  cloneDocument,
  createBlankScheme,
  createElement,
  createSchemeId,
  createStarterDocument,
  findElement,
  getBoundingBox,
  normalizeRotation,
  sortSchemes,
} from './domain';
import type { SchemeRepository } from './repository';
import type {
  Analysis,
  AppScreen,
  ElementKind,
  LayoutDocument,
  LayoutMode,
  LayoutScheme,
  Notice,
  RenderElement,
  SchemeLibrary,
  SchemeSortKey,
  SchemeSummary,
  ViewPhase,
} from './types';

export interface ExpoSketchState {
  phase: ViewPhase;
  screen: AppScreen;
  library: SchemeLibrary;
  activeSchemeId: string | null;
  activeScheme: LayoutScheme | null;
  document: LayoutDocument;
  renderElements: RenderElement[];
  selectedId: string | null;
  selectedElement: RenderElement | null;
  mode: LayoutMode;
  analysis: Analysis;
  notice: Notice;
  lastSavedAt: number | null;
  isDirty: boolean;
  sortKey: SchemeSortKey;
  sortedSchemes: LayoutScheme[];
  summaries: SchemeSummary[];
  /** 有未保存改动时请求切换到另一个方案，等待用户选择带过去还是放弃。 */
  switchTargetId: string | null;
  /** 有未保存改动时请求新建方案，同样需要先仲裁手上的改动。 */
  pendingCreateName: string | null;
}

const toRenderElements = (document: LayoutDocument): RenderElement[] => document.elements.map((element) => {
  const box = getBoundingBox(element);
  return { ...element, displayWidth: box.width, displayHeight: box.height, occupiedArea: Number((box.width * box.height).toFixed(1)) };
});

const fieldLabel = (scheme: LayoutScheme) => `${scheme.document.field.width}×${scheme.document.field.height} m`;

type Listener = () => void;

export class ExpoSketchViewModel {
  private listeners = new Set<Listener>();
  /** 当前方案最近一次已保存内容的快照，用于判断有没有未保存的改动。 */
  private savedSnapshot: string | null = null;
  private initPromise: Promise<void> | null = null;
  private stateValue: ExpoSketchState = {
    phase: 'loading',
    screen: 'library',
    library: { version: 1, schemes: [] },
    activeSchemeId: null,
    activeScheme: null,
    document: createStarterDocument(),
    renderElements: toRenderElements(createStarterDocument()),
    selectedId: null,
    selectedElement: null,
    mode: 'edit',
    analysis: analyzeLayout(createStarterDocument()),
    notice: { tone: 'info', message: '正在打开方案库…' },
    lastSavedAt: null,
    isDirty: false,
    sortKey: 'updatedAt',
    sortedSchemes: [],
    summaries: [],
    switchTargetId: null,
    pendingCreateName: null,
  };

  constructor(private readonly repository: SchemeRepository) {}

  get state() { return this.stateValue; }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initialize(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.bootstrap();
    return this.initPromise;
  }

  async retryLoad() {
    this.initPromise = null;
    await this.initialize();
  }

  private async bootstrap() {
    this.commit({ phase: 'loading', notice: { tone: 'info', message: '正在打开方案库…' } });
    try {
      const library = await this.repository.loadLibrary();
      this.savedSnapshot = null;
      this.commit({
        phase: 'ready',
        screen: 'library',
        library,
        activeSchemeId: null,
        activeScheme: null,
        selectedId: null,
        switchTargetId: null,
        pendingCreateName: null,
        notice: { tone: 'success', message: `方案库已就绪，共 ${library.schemes.length} 个方案` },
      });
    } catch {
      this.commit({ phase: 'error', notice: { tone: 'error', message: '方案库读取失败，请重试' } });
    }
  }

  backToLibrary() {
    this.commit({ screen: 'library', switchTargetId: null, pendingCreateName: null, notice: { tone: 'info', message: '改动仍保留在工作区，可随时回来继续' } });
  }

  setSortKey(sortKey: SchemeSortKey) {
    this.commit({ sortKey });
  }

  async createScheme(name?: string) {
    // 手上还有没保存完的改动时，先让用户选择带过去还是放弃，不直接丢掉。
    if (this.stateValue.isDirty) {
      this.commit({ pendingCreateName: name?.trim() || null });
      return;
    }
    await this.performCreateScheme(name);
  }

  private async performCreateScheme(name?: string, notice?: Notice) {
    const scheme = createBlankScheme();
    scheme.name = name?.trim() || scheme.name;
    const library: SchemeLibrary = { ...this.stateValue.library, schemes: [...this.stateValue.library.schemes, scheme] };
    if (!(await this.persistLibrary(library))) return;
    this.openSavedScheme(scheme, notice ?? { tone: 'success', message: `已新建方案「${scheme.name}」` });
  }

  /** 从方案库打开方案；若当前工作区有未保存改动，则先弹出选择而不是直接丢掉。 */
  requestOpenScheme(id: string) {
    if (id === this.stateValue.activeSchemeId) {
      this.commit({ screen: 'editor', notice: { tone: 'info', message: '当前就在这个方案中' } });
      return;
    }
    if (this.stateValue.isDirty) {
      this.commit({ switchTargetId: id });
      return;
    }
    void this.openSchemeById(id);
  }

  async saveCurrent(): Promise<boolean> {
    const active = this.stateValue.activeScheme;
    if (!active) return false;
    const updatedAt = Date.now();
    const saved: LayoutScheme = { ...active, document: cloneDocument(this.stateValue.document), updatedAt };
    const library = this.replaceScheme(saved);
    try {
      await this.repository.saveLibrary(library);
    } catch {
      this.commit({ notice: { tone: 'error', message: '方案保存失败，改动仍保留在当前页面' } });
      return false;
    }
    this.savedSnapshot = JSON.stringify(saved.document);
    this.commit({ library, activeScheme: saved, lastSavedAt: updatedAt, notice: { tone: 'success', message: `方案「${saved.name}」已保存` } });
    return true;
  }

  async saveCurrentAs(name: string) {
    const active = this.stateValue.activeScheme;
    if (!active) return;
    const trimmed = name.trim() || `${active.name} 副本`;
    const now = Date.now();
    const scheme: LayoutScheme = { id: createSchemeId(), name: trimmed, document: cloneDocument(this.stateValue.document), createdAt: now, updatedAt: now };
    const library: SchemeLibrary = { ...this.stateValue.library, schemes: [...this.stateValue.library.schemes, scheme] };
    try {
      await this.repository.saveLibrary(library);
    } catch {
      this.commit({ notice: { tone: 'error', message: '另存方案失败，改动仍保留在当前页面' } });
      return;
    }
    this.openSavedScheme(scheme, { tone: 'success', message: `已另存为新方案「${trimmed}」` }, library);
  }

  async duplicateScheme(id: string, name?: string) {
    const source = this.stateValue.library.schemes.find((scheme) => scheme.id === id);
    if (!source) return;
    const copyName = (name?.trim() || `${source.name} 副本`).trim();
    const now = Date.now();
    const copy: LayoutScheme = { id: createSchemeId(), name: copyName, document: cloneDocument(source.document), createdAt: now, updatedAt: now };
    const library: SchemeLibrary = { ...this.stateValue.library, schemes: [...this.stateValue.library.schemes, copy] };
    try {
      await this.repository.saveLibrary(library);
    } catch {
      this.commit({ notice: { tone: 'error', message: '复制方案失败，未写入方案库' } });
      return;
    }
    this.commit({ library, notice: { tone: 'success', message: `已复制出方案「${copyName}」` } });
  }

  async renameScheme(id: string, name: string) {
    const trimmed = name.trim();
    const scheme = this.stateValue.library.schemes.find((item) => item.id === id);
    if (!trimmed || !scheme) return;
    const renamed: LayoutScheme = { ...scheme, name: trimmed, updatedAt: Date.now() };
    const library = this.replaceScheme(renamed);
    try {
      await this.repository.saveLibrary(library);
    } catch {
      this.commit({ notice: { tone: 'error', message: '重命名失败，未写入方案库' } });
      return;
    }
    this.commit({ library, activeScheme: this.stateValue.activeSchemeId === id ? renamed : this.stateValue.activeScheme, notice: { tone: 'success', message: `方案已重命名为「${trimmed}」` } });
  }

  async deleteScheme(id: string) {
    const scheme = this.stateValue.library.schemes.find((item) => item.id === id);
    if (!scheme) return;
    const removingActive = id === this.stateValue.activeSchemeId;
    let remaining = this.stateValue.library.schemes.filter((item) => item.id !== id);
    // 删掉正在用（或是最后一个）方案后，必须落到一个仍然可用的方案上。
    let fallback: LayoutScheme | null = null;
    if (remaining.length === 0) {
      fallback = createBlankScheme();
      remaining = [fallback];
    } else if (removingActive) {
      fallback = sortSchemes(remaining, 'updatedAt')[0];
    }
    const library: SchemeLibrary = { ...this.stateValue.library, schemes: remaining };
    // 破坏性操作：先确认落盘成功，再更新界面，避免界面删掉了、重启后又回来。
    try {
      await this.repository.saveLibrary(library);
    } catch {
      this.commit({ notice: { tone: 'error', message: '删除失败，方案仍保留在方案库中' } });
      return;
    }
    if (removingActive && fallback) {
      this.openSavedScheme(fallback, { tone: 'warning', message: `正在使用的方案已删除，已切换到「${fallback.name}」` }, library);
    } else {
      this.commit({ library, notice: { tone: 'info', message: `方案「${scheme.name}」已删除` } });
    }
  }

  /** 保存当前改动后再切换/新建，改动带到原方案名下。 */
  async confirmSaveAndSwitch() {
    const { switchTargetId, pendingCreateName } = this.stateValue;
    if (!switchTargetId && pendingCreateName === null) return;
    const saved = await this.saveCurrent();
    if (!saved) return; // 保存失败时不离开，避免变相丢改动
    const createName = pendingCreateName;
    this.commit({ switchTargetId: null, pendingCreateName: null });
    if (switchTargetId) await this.openSchemeById(switchTargetId);
    else await this.performCreateScheme(createName ?? undefined);
  }

  /** 放弃未保存的改动后切换/新建。 */
  async confirmDiscardAndSwitch() {
    const { switchTargetId, pendingCreateName } = this.stateValue;
    if (!switchTargetId && pendingCreateName === null) return;
    const createName = pendingCreateName;
    this.commit({ switchTargetId: null, pendingCreateName: null });
    if (switchTargetId) {
      await this.openSchemeById(switchTargetId, { tone: 'info', message: '未保存的改动已放弃，已切换方案' });
    } else {
      await this.performCreateScheme(createName ?? undefined, { tone: 'info', message: '未保存的改动已放弃，已新建方案' });
    }
  }

  cancelSwitch() {
    if (!this.stateValue.switchTargetId && this.stateValue.pendingCreateName === null) return;
    this.commit({ switchTargetId: null, pendingCreateName: null, notice: { tone: 'info', message: '已留在当前方案，改动未丢失' } });
  }

  selectElement(id: string) { this.commit({ selectedId: id }); }

  setMode(mode: LayoutMode) { this.commit({ mode, notice: { tone: 'info', message: mode === 'inspect' ? '检查模式已开启：拖动元素查看即时提示' : mode === 'path' ? '路径模式已开启：入口到重点区域的访问路线已生成' : '编辑模式已开启' } }); }

  addElement(kind: ElementKind) {
    const element = createElement(kind, this.stateValue.document.elements.length, this.stateValue.document.field);
    const document = { ...this.stateValue.document, elements: [...this.stateValue.document.elements, element] };
    this.commit({ document, selectedId: element.id, notice: { tone: 'success', message: `${element.name} 已加入场地（保存后写入方案）` } });
  }

  removeSelected() {
    if (!this.stateValue.selectedId) return;
    const removed = findElement(this.stateValue.document, this.stateValue.selectedId);
    const elements = this.stateValue.document.elements.filter((element) => element.id !== this.stateValue.selectedId);
    this.commit({ document: { ...this.stateValue.document, elements }, selectedId: elements[0]?.id ?? null, notice: { tone: 'info', message: `${removed?.name ?? '元素'} 已移除（保存后写入方案）` } });
  }

  moveElement(id: string, x: number, y: number) {
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) } : element);
    this.commit({ document: { ...this.stateValue.document, elements } });
  }

  resizeSelected(width: number, height: number) {
    const id = this.stateValue.selectedId;
    if (!id || width <= 0 || height <= 0) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, width: Number(width.toFixed(1)), height: Number(height.toFixed(1)) } : element);
    this.commit({ document: { ...this.stateValue.document, elements } });
  }

  rotateSelected() {
    const id = this.stateValue.selectedId;
    if (!id) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, rotation: normalizeRotation(element.rotation + 90) } : element);
    this.commit({ document: { ...this.stateValue.document, elements }, notice: { tone: 'info', message: '方向已旋转 90°（保存后写入方案）' } });
  }

  renameSelected(name: string) {
    const id = this.stateValue.selectedId;
    if (!id || !name.trim()) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, name } : element);
    this.commit({ document: { ...this.stateValue.document, elements } });
  }

  resizeField(width: number, height: number) {
    if (width < 12 || height < 10) return;
    this.commit({ document: { ...this.stateValue.document, field: { width: Number(width.toFixed(1)), height: Number(height.toFixed(1)) } }, notice: { tone: 'success', message: '场地尺寸已更新（保存后写入方案）' } });
  }

  resetExample() {
    const document = createStarterDocument();
    this.commit({ document, selectedId: 'stage-1', mode: 'edit', notice: { tone: 'warning', message: '示例布局已载入工作区，保存后才会覆盖当前方案' } });
  }

  private async openSchemeById(id: string, notice?: Notice) {
    const scheme = this.stateValue.library.schemes.find((item) => item.id === id);
    if (!scheme) return;
    this.openSavedScheme(scheme, notice ?? { tone: 'info', message: `已切换到方案「${scheme.name}」` });
  }

  private openSavedScheme(scheme: LayoutScheme, notice: Notice, library: SchemeLibrary = this.stateValue.library) {
    const document = cloneDocument(scheme.document);
    this.savedSnapshot = JSON.stringify(scheme.document);
    this.commit({
      library,
      document,
      activeSchemeId: scheme.id,
      activeScheme: scheme,
      selectedId: document.elements[0]?.id ?? null,
      mode: 'edit',
      screen: 'editor',
      switchTargetId: null,
      pendingCreateName: null,
      lastSavedAt: scheme.updatedAt,
      notice,
    });
  }

  private replaceScheme(scheme: LayoutScheme): SchemeLibrary {
    return { ...this.stateValue.library, schemes: this.stateValue.library.schemes.map((item) => item.id === scheme.id ? scheme : item) };
  }

  private async persistLibrary(library: SchemeLibrary, failureMessage = '方案库保存失败，改动仅保留在当前页面'): Promise<boolean> {
    this.commit({ library });
    try {
      await this.repository.saveLibrary(library);
      return true;
    } catch {
      this.commit({ notice: { tone: 'error', message: failureMessage } });
      return false;
    }
  }

  private commit(patch: Partial<ExpoSketchState>) {
    const next = { ...this.stateValue, ...patch };
    const renderElements = toRenderElements(next.document);
    const sortedSchemes = sortSchemes(next.library.schemes, next.sortKey);
    const activeScheme = next.activeSchemeId ? next.library.schemes.find((scheme) => scheme.id === next.activeSchemeId) ?? null : null;
    const isDirty = this.savedSnapshot !== null && JSON.stringify(next.document) !== this.savedSnapshot;
    const summaries: SchemeSummary[] = sortedSchemes.map((scheme) => ({
      id: scheme.id,
      name: scheme.name,
      elementCount: scheme.document.elements.length,
      fieldLabel: fieldLabel(scheme),
      createdAt: scheme.createdAt,
      updatedAt: scheme.updatedAt,
      isActive: scheme.id === next.activeSchemeId,
      isDirty: scheme.id === next.activeSchemeId && isDirty,
    }));
    this.stateValue = {
      ...next,
      activeScheme,
      renderElements,
      selectedElement: renderElements.find((element) => element.id === next.selectedId) ?? null,
      analysis: analyzeLayout(next.document),
      isDirty,
      sortedSchemes,
      summaries,
    };
    this.listeners.forEach((listener) => listener());
  }
}
