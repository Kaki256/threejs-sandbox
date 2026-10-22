import * as Vue from 'vue';
import * as THREE from 'three/webgpu';
import * as Orbit from 'three/addons/controls/OrbitControls.js';
import * as GLTF from 'three/addons/loaders/GLTFLoader.js';
import * as TDS from 'three/addons/loaders/TDSLoader.js';
import * as Collada from 'three/addons/loaders/ColladaLoader.js';
import * as OBJ from 'three/addons/loaders/OBJLoader.js';
import * as STL from 'three/addons/loaders/STLLoader.js';
import * as AreaLight from 'three/addons/lights/RectAreaLightTexturesLib.js';
import { isRecord, sandboxChannel } from './protocol';
import { captureCanvas, installCaptureControls } from './capture';

const modules: Record<string, unknown> = {
  vue: Vue,
  three: THREE,
  'three/webgpu': THREE,
  'three/addons/controls/OrbitControls.js': Orbit,
  'three/addons/loaders/GLTFLoader.js': GLTF,
  'three/addons/loaders/TDSLoader.js': TDS,
  'three/addons/loaders/ColladaLoader.js': Collada,
  'three/addons/loaders/OBJLoader.js': OBJ,
  'three/addons/loaders/STLLoader.js': STL,
  'three/addons/lights/RectAreaLightTexturesLib.js': AreaLight,
};
const runId = window.name;
let app: Vue.App | undefined;

function notify(type: 'booted' | 'ready' | 'error', message = '') {
  parent.postMessage({ channel: sandboxChannel, runId, type, message }, '*');
}
function report(error: unknown) {
  notify('error', error instanceof Error ? error.message : String(error));
}
function requireModule(name: string) {
  const dependency = modules[name];
  if (!dependency) throw new Error(`「${name}」はプレビューで使える import に含まれていません。編集欄の「使い方・import」を確認してください。`);
  return dependency;
}

window.addEventListener('error', event => { event.preventDefault(); report(event.error ?? event.message); });
window.addEventListener('unhandledrejection', event => { event.preventDefault(); report(event.reason); });
window.addEventListener('pagehide', () => app?.unmount());
window.addEventListener('message', async event => {
  const data: unknown = event.data;
  if (event.source !== parent || !isRecord(data) || data.channel !== sandboxChannel || data.runId !== runId) return;
  if (data.type === 'stop') { app?.unmount(); return; }
  if (data.type === 'capture') { void captureCanvas(); return; }
  if (data.type !== 'run' || typeof data.code !== 'string' || typeof data.css !== 'string' || typeof data.scopeId !== 'string') return;
  try {
    const style = document.createElement('style');
    style.textContent = data.css;
    document.head.append(style);
    const exports: Record<string, unknown> = {};
    const module = { exports };
    const execute = new Function('require', 'module', 'exports', `${data.code}\n//# sourceURL=Sandbox.vue.js`);
    execute(requireModule, module, exports);
    const result: unknown = module.exports;
    if (!isRecord(result) || !isRecord(result.default)) throw new Error('Vue コンポーネントの export default を確認してください。');
    result.default.__scopeId = data.scopeId;
    app = Vue.createApp(result.default);
    app.config.errorHandler = report;
    app.mount('#app');
    await Vue.nextTick();
    installCaptureControls(data.scopeId);
    notify('ready');
  } catch (error) { report(error); }
});
notify('booted');
