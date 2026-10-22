export const sandboxChannel = 'threejs-learning-preview';

export interface CompiledSandbox {
  code: string;
  css: string;
  scopeId: string;
}

export interface SandboxIssue {
  phase: 'compile' | 'runtime';
  message: string;
  line?: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
