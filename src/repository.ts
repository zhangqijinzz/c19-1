import { LEGACY_DOCUMENT_KEY, PLAN_LIBRARY_KEY } from './storageService';
import type { JsonStorageService } from './storageService';
import type { ExpoElement, LayoutDocument, LayoutPlan } from './types';

export interface PlanLibraryRepository {
  loadLibrary(): Promise<LayoutPlan[]>;
  saveLibrary(plans: LayoutPlan[]): Promise<void>;
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

const isPlan = (value: unknown): value is LayoutPlan => {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Record<string, unknown>;
  return typeof plan.id === 'string' && typeof plan.name === 'string' && typeof plan.createdAt === 'number' && typeof plan.updatedAt === 'number' && isDocument(plan.document);
};

export const LEGACY_PLAN_ID = 'legacy-layout';

export class LocalPlanLibraryRepository implements PlanLibraryRepository {
  constructor(private readonly storage: JsonStorageService) {}

  async loadLibrary(): Promise<LayoutPlan[]> {
    const stored = await this.storage.readJson<unknown>(PLAN_LIBRARY_KEY).catch(() => null);
    if (Array.isArray(stored)) return stored.filter(isPlan);

    const migrated = await this.migrateLegacyDocument();
    if (migrated) {
      await this.storage.writeJson(PLAN_LIBRARY_KEY, [migrated]);
      await this.storage.remove(LEGACY_DOCUMENT_KEY).catch(() => {});
      return [migrated];
    }

    return [];
  }

  async saveLibrary(plans: LayoutPlan[]): Promise<void> {
    await this.storage.writeJson(PLAN_LIBRARY_KEY, plans);
  }

  private async migrateLegacyDocument(): Promise<LayoutPlan | null> {
    try {
      const legacy = await this.storage.readJson<unknown>(LEGACY_DOCUMENT_KEY);
      if (!isDocument(legacy)) return null;
      const timestamp = Date.now();
      const name = legacy.title.trim() || '本地布局';
      return {
        id: LEGACY_PLAN_ID,
        name,
        createdAt: timestamp,
        updatedAt: timestamp,
        document: { ...legacy, title: name },
      };
    } catch {
      return null;
    }
  }
}
