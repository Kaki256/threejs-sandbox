import type { FileType, FileSystem } from '@volar/monaco/worker';
import { isRecord } from '../protocol';

export interface LocalTypeData { files: Record<string, string>; versions: Record<string, string> }

export async function loadLocalTypes(): Promise<LocalTypeData> {
  const response = await fetch(`${import.meta.env.BASE_URL}sandbox-editor-types.json`);
  if (!response.ok) throw new Error('ローカル型情報を読み込めませんでした。bun run build:editor-data で生成してください。');
  const data: unknown = await response.json();
  if (!isRecord(data) || !isRecord(data.files) || !isRecord(data.versions)) throw new Error('型情報の形式を読み取れません。');
  const files: Record<string, string> = {};
  const versions: Record<string, string> = {};
  for (const [path, text] of Object.entries(data.files)) {
    if (typeof text !== 'string' || !path.startsWith('/node_modules/')) throw new Error('型ファイルの形式を読み取れません。');
    files[path] = text;
  }
  for (const [name, version] of Object.entries(data.versions)) {
    if (typeof version !== 'string') throw new Error('型情報のバージョンを読み取れません。');
    versions[name] = version;
  }
  return { files, versions };
}

export function createLocalFileSystem(files: Record<string, string>): FileSystem {
  const file = 1 satisfies FileType.File;
  const directory = 2 satisfies FileType.Directory;
  const directories = new Map<string, Map<string, FileType>>();
  for (const path of Object.keys(files)) {
    const parts = path.split('/').filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const parent = '/' + parts.slice(0, i).join('/');
      const children = directories.get(parent) ?? new Map<string, FileType>();
      children.set(parts[i], i === parts.length - 1 ? file : directory);
      directories.set(parent, children);
    }
  }
  return {
    readFile: uri => uri.scheme === 'file' ? files[uri.path] : undefined,
    readDirectory: uri => uri.scheme === 'file' ? [...(directories.get(uri.path) ?? [])] : [],
    stat(uri) {
      if (uri.scheme !== 'file') return;
      const text = files[uri.path];
      if (text !== undefined) return { type: file, ctime: 0, mtime: 0, size: text.length };
      if (directories.has(uri.path)) return { type: directory, ctime: 0, mtime: 0, size: 0 };
    },
  };
}
