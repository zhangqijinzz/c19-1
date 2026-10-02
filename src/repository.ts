import { createSchemeFromDocument, createStarterDocument } from './domain';
import { LEGACY_DOCUMENT_KEY, LIBRARY_KEY, type KeyValueStorageService } from './storageService';
import type { ExpoElement, LayoutDocument, LayoutScheme, SchemeLibrary } from './types';

export interface SchemeRepository {
  loadLibrary(): Promise<SchemeLibrary>;
  saveLibrary(library: SchemeLibrary): Promise<void>;
}

const isElement = (value: unknown): value is ExpoElement => {
  if (!value || typeof value !== 'object') return false;
  const element = value as Record<string, unknown>;
  return typeof element.id === 'string' && typeof element.kind === 'string' && typeof element.x === 'number' && typeof element.y === 'number' && typeof element.width === 'number' && typeof element.height === 'number' && typeof element.rotation === 'number';
};

const isDocument = (value: unknown): value is LayoutDocument => {
  if (!value || typeof value !== 'object') return false;
  const document = value as Record<string, unknown>;
  const field = document.field as Record<string, unknown> | undefined;
  return document.version === 1 && typeof document.title === 'string' && !!field && typeof field.width === 'number' && typeof field.height === 'number' && Array.isArray(document.elements) && document.elements.every(isElement);
};

const isScheme = (value: unknown): value is LayoutScheme => {
  if (!value || typeof value !== 'object') return false;
  const scheme = value as Record<string, unknown>;
  return typeof scheme.id === 'string' && typeof scheme.name === 'string' && isDocument(scheme.document) && typeof scheme.createdAt === 'number' && typeof scheme.updatedAt === 'number';
};

/** 过滤掉损坏的方案；返回修复后的库以及是否发生过修复。 */
export const repairLibrary = (value: unknown): { library: SchemeLibrary; changed: boolean } | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 || !Array.isArray(raw.schemes)) return null;
  const schemes = raw.schemes.filter(isScheme);
  return { library: { version: 1, schemes }, changed: schemes.length !== raw.schemes.length };
};

const migratedSchemeName = (document: LayoutDocument) => document.title.trim() || '本地布局';

export class LocalSchemeRepository implements SchemeRepository {
  constructor(private readonly storage: KeyValueStorageService) {}

  async loadLibrary(): Promise<SchemeLibrary> {
    const stored = await this.storage.read<unknown>(LIBRARY_KEY);
    const repaired = repairLibrary(stored);
    if (repaired) {
      // 旧版本遗留的单份布局在方案库存在后即完成历史使命，清掉避免重复迁移。
      await this.safeRemoveLegacy();
      if (repaired.changed) await this.saveLibrary(repaired.library);
      return repaired.library;
    }

    // 方案库不存在或整体损坏：优先把旧版本的单份布局迁成第一个方案，
    // 只有连旧布局也没有/损坏时，才用示例方案初始化，保证用户数据不丢、不被顶掉。
    const legacy = await this.storage.read<unknown>(LEGACY_DOCUMENT_KEY);
    if (isDocument(legacy)) {
      const library: SchemeLibrary = { version: 1, schemes: [createSchemeFromDocument(legacy, migratedSchemeName(legacy))] };
      await this.storage.write(LIBRARY_KEY, library);
      await this.safeRemoveLegacy();
      return library;
    }

    const starter = createStarterDocument();
    const library: SchemeLibrary = { version: 1, schemes: [createSchemeFromDocument(starter, starter.title)] };
    await this.storage.write(LIBRARY_KEY, library);
    await this.safeRemoveLegacy();
    return library;
  }

  async saveLibrary(library: SchemeLibrary): Promise<void> {
    await this.storage.write(LIBRARY_KEY, library);
  }

  private async safeRemoveLegacy(): Promise<void> {
    try {
      await this.storage.remove(LEGACY_DOCUMENT_KEY);
    } catch {
      // 旧键清理失败不影响方案库本身，下次启动还会再尝试。
    }
  }
}
