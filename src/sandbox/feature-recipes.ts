import { isRecord } from './protocol';
import type { FeatureTarget } from './section-guide';
import { buildPresetRecipe, createPresetDraft, featurePresets } from './feature-presets';

export interface FeatureRecipe {
  id: string;
  kind: 'snippet' | 'orbit';
  target: FeatureTarget;
  title: string;
  description: string;
  imports: string;
  setup: string;
  frame: string;
  cleanup: string;
}

export const featureRecipes: FeatureRecipe[] = featurePresets.map(preset => buildPresetRecipe(createPresetDraft(preset)));

export const recipeStoragePrefix = 'threejs-learning:sandbox:recipe:v1:';

export function parseCustomRecipe(value: unknown): FeatureRecipe | undefined {
  if (!isRecord(value) || value.kind !== 'snippet' || typeof value.id !== 'string' || !/^custom-[\w-]{8,100}$/.test(value.id)
    || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 40
    || typeof value.description !== 'string' || value.description.length > 200
    || typeof value.imports !== 'string' || value.imports.length > 10000
    || typeof value.setup !== 'string' || !value.setup.trim() || value.setup.length > 30000
    || typeof value.frame !== 'string' || value.frame.length > 10000
    || typeof value.cleanup !== 'string' || value.cleanup.length > 10000) return;
  if (value.target !== undefined && value.target !== 'items' && value.target !== 'camera') return;
  return { id: value.id, kind: 'snippet', target: value.target === 'camera' ? 'camera' : 'items', title: value.title.trim(), description: value.description,
    imports: value.imports, setup: value.setup, frame: value.frame, cleanup: value.cleanup };
}
