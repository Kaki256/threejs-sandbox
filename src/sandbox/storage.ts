import { ref, shallowRef } from 'vue';
import { isRecord } from './protocol';

export interface SandboxProject {
  schema: 1;
  id: string;
  title: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  revision: string;
}

export type SaveResult = { kind: 'saved'; project: SandboxProject }
  | { kind: 'conflict'; project: SandboxProject | null }
  | { kind: 'error'; message: string };

const prefix = 'threejs-learning:sandbox:v1:';
export const sandboxProjects = shallowRef<SandboxProject[]>([]);
export const storageNotice = ref('');
export const libraryVersion = ref(0);
let initialized = false;
const volatileProjects = new Map<string, SandboxProject>();

export function parseProject(value: unknown): SandboxProject | undefined {
  if (!isRecord(value) || value.schema !== 1 || typeof value.id !== 'string' || !/^[\w-]{8,100}$/.test(value.id)
    || typeof value.title !== 'string' || typeof value.source !== 'string' || typeof value.revision !== 'string'
    || typeof value.createdAt !== 'number' || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0 || value.createdAt > 8640000000000000
    || typeof value.updatedAt !== 'number' || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0 || value.updatedAt > 8640000000000000) return;
  return { schema: 1, id: value.id, title: value.title, source: value.source, createdAt: value.createdAt, updatedAt: value.updatedAt, revision: value.revision };
}
function decode(raw: string | null) {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  const project = parseProject(value);
  if (!project) throw new Error('保存データの形式を読み取れません。');
  return project;
}
function remember(project: SandboxProject, persisted = true) {
  if (persisted) volatileProjects.delete(project.id);
  else volatileProjects.set(project.id, project);
  sandboxProjects.value = [...sandboxProjects.value.filter(item => item.id !== project.id), project].sort((a, b) => b.updatedAt - a.updatedAt);
  libraryVersion.value++;
}
function errorMessage(error: unknown) {
  return `ブラウザへの保存を利用できません。コードをダウンロードして保管してください。${error instanceof Error ? ` (${error.message})` : ''}`;
}
export function refreshLibrary() {
  try {
    const projects: SandboxProject[] = [];
    let unreadable = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      try {
        const project = decode(localStorage.getItem(key));
        if (project && key === prefix + project.id) projects.push(project);
        else unreadable++;
      } catch { unreadable++; }
    }
    sandboxProjects.value = [...projects.filter(project => !volatileProjects.has(project.id)), ...volatileProjects.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    storageNotice.value = [
      unreadable ? `${unreadable}件の保存データを読み取れませんでした。元のデータはブラウザ内に残っています。` : '',
      volatileProjects.size ? `${volatileProjects.size}件の編集を画面内に保持しています。ブラウザに保存できていないため、バックアップで保管できます。` : '',
    ].filter(Boolean).join(' ');
    libraryVersion.value++;
  } catch (error) { storageNotice.value = errorMessage(error); }
}
export function initializeLibrary() {
  if (initialized) return;
  initialized = true;
  refreshLibrary();
  window.addEventListener('storage', event => {
    if (event.key === null || event.key.startsWith(prefix)) refreshLibrary();
  });
}
export function findProject(id: string) { return sandboxProjects.value.find(project => project.id === id); }
export function hasRetainedDraft(id: string) { return volatileProjects.has(id); }

export function saveProject(draft: SandboxProject, expectedRevision: string | null): SaveResult {
  try {
    const stored = decode(localStorage.getItem(prefix + draft.id));
    if ((stored?.revision ?? null) !== expectedRevision) return { kind: 'conflict', project: stored };
    const project: SandboxProject = { ...draft, title: draft.title.trim() || '無題の作品', revision: crypto.randomUUID(), updatedAt: Date.now() };
    localStorage.setItem(prefix + project.id, JSON.stringify(project));
    remember(project);
    storageNotice.value = '';
    return { kind: 'saved', project };
  } catch (error) {
    remember(draft, false);
    storageNotice.value = errorMessage(error);
    return { kind: 'error', message: storageNotice.value };
  }
}
export function createProject(title: string, source: string) {
  const now = Date.now();
  const draft: SandboxProject = { schema: 1, id: crypto.randomUUID(), title, source, createdAt: now, updatedAt: now, revision: '' };
  const result = saveProject(draft, null);
  if (result.kind === 'conflict') {
    remember(draft, false);
  }
  return result.kind === 'saved' ? result.project : draft;
}
export function deleteProject(project: SandboxProject): { kind: 'deleted' } | { kind: 'error'; message: string } {
  try {
    const stored = decode(localStorage.getItem(prefix + project.id));
    if (stored && stored.revision !== project.revision) return { kind: 'error', message: '別のタブで更新されています。一覧を更新してから削除してください。' };
    localStorage.removeItem(prefix + project.id);
    volatileProjects.delete(project.id);
    sandboxProjects.value = sandboxProjects.value.filter(item => item.id !== project.id);
    libraryVersion.value++;
    return { kind: 'deleted' };
  } catch (error) { return { kind: 'error', message: errorMessage(error) }; }
}
export function retainDraft(project: SandboxProject) { remember(project, false); }
export function discardDraft(id: string) { volatileProjects.delete(id); refreshLibrary(); }
export function downloadFile(filename: string, content: string | Blob, type = 'text/plain') {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
