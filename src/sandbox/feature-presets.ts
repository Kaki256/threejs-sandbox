import type { FeatureRecipe } from './feature-recipes';

type PresetInfo = { id: string; title: string; description: string };
type MeshPreset = PresetInfo & { kind: 'mesh'; shape: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'knot' | 'plane' };
type LightPreset = PresetInfo & { kind: 'light'; light: 'directional' | 'point' | 'ambient' };
type GuidePreset = PresetInfo & { kind: 'guide'; helper: 'grid' | 'axes' };
type OrbitPreset = PresetInfo & { kind: 'orbit' };
type CameraPreset = PresetInfo & { kind: 'camera' };
export type FeaturePreset = MeshPreset | LightPreset | GuidePreset | OrbitPreset | CameraPreset;
type Position = { x: number; y: number; z: number };
export type PresetDraft =
  | { kind: 'mesh'; preset: MeshPreset; size: number; color: string; material: 'basic' | 'normal' | 'standard'; wireframe: boolean; placement: 'beside' | 'center'; position: Position; rotation: number; speed: number; scale: Position }
  | { kind: 'light'; preset: LightPreset; color: string; intensity: number; position: Position }
  | { kind: 'guide'; preset: GuidePreset; size: number; divisions: number; color: string }
  | { kind: 'orbit'; preset: OrbitPreset; damping: number; autoRotate: boolean; speed: number; zoom: boolean; pan: boolean }
  | { kind: 'camera'; preset: CameraPreset; fov: number; zoom: number };

export const featurePresets: FeaturePreset[] = [
  { id: 'box', kind: 'mesh', shape: 'box', title: '箱を追加', description: '幅・高さ・奥行きのある基本の形です。' },
  { id: 'sphere', kind: 'mesh', shape: 'sphere', title: '球を追加', description: '丸い形で色や回転を試せます。' },
  { id: 'cylinder', kind: 'mesh', shape: 'cylinder', title: '円柱を追加', description: '柱や台座のような形です。' },
  { id: 'cone', kind: 'mesh', shape: 'cone', title: '円すいを追加', description: '先のとがった形です。' },
  { id: 'torus', kind: 'mesh', shape: 'torus', title: 'ドーナツを追加', description: '穴のある輪を作ります。' },
  { id: 'knot', kind: 'mesh', shape: 'knot', title: '結び目を追加', description: '絡み合った輪で立体感を試せます。' },
  { id: 'plane', kind: 'mesh', shape: 'plane', title: '床を追加', description: '水平な板をモデルの足元に置きます。' },
  { id: 'directional', kind: 'light', light: 'directional', title: '平行光を追加', description: '指定した方向からモデルの中心を照らします。' },
  { id: 'point', kind: 'light', light: 'point', title: '点光源を追加', description: '置いた位置から全方向を照らします。' },
  { id: 'ambient', kind: 'light', light: 'ambient', title: '環境光を追加', description: 'シーン全体の暗い部分を明るくします。' },
  { id: 'grid', kind: 'guide', helper: 'grid', title: 'グリッドを追加', description: '足元に方眼を置き、大きさや位置を見やすくします。' },
  { id: 'axes', kind: 'guide', helper: 'axes', title: '座標軸を追加', description: 'X=赤・Y=緑・Z=青の線を表示します。' },
  { id: 'orbit', kind: 'orbit', title: '視点移動を追加', description: 'ドラッグで回転、ホイールで拡大、右ドラッグで平行移動できます。' },
  { id: 'camera-lens', kind: 'camera', title: '画角・ズームを設定', description: 'カメラの位置を変えずに、写る範囲を調整します。' },
];

export function presetTarget(preset: FeaturePreset) { return preset.kind === 'orbit' || preset.kind === 'camera' ? 'camera' : 'items'; }

export function createPresetDraft(preset: FeaturePreset): PresetDraft {
  switch (preset.kind) {
    case 'mesh': return { kind: 'mesh', preset, size: preset.shape === 'plane' ? 4 : 1, color: '#4aa8d8', material: 'basic', wireframe: false,
      placement: preset.shape === 'plane' ? 'center' : 'beside', position: { x: 0, y: 0, z: 0 }, rotation: 0, speed: 0, scale: { x: 1, y: 1, z: 1 } };
    case 'light': return { kind: 'light', preset, color: '#ffffff', intensity: preset.light === 'ambient' ? 0.5 : 3, position: { x: 2, y: 3, z: 2 } };
    case 'guide': return { kind: 'guide', preset, size: 4, divisions: 10, color: '#69859c' };
    case 'orbit': return { kind: 'orbit', preset, damping: 0.1, autoRotate: false, speed: 2, zoom: true, pan: true };
    case 'camera': return { kind: 'camera', preset, fov: 45, zoom: 1 };
    default: { const exhaustive: never = preset; return exhaustive; }
  }
}

function number(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`数値は ${min}〜${max} の範囲で入力してください。`);
  return String(value);
}
function color(value: string) {
  if (!/^#[\da-f]{6}$/i.test(value)) throw new Error('色を選択してください。');
  return `'${value}'`;
}
function position(value: Position) { return [value.x, value.y, value.z].map(item => number(item, -20, 20)); }

// A unit is relative to the current model, so the same controls work for the tiny STL and the large starters.
const boundsCode = `const __id__Bounds = new THREE.Box3();
scene.updateMatrixWorld(true);
scene.traverse(object => {
  if (object instanceof THREE.Mesh) __id__Bounds.expandByObject(object);
});
const __id__Size = __id__Bounds.getSize(new THREE.Vector3());
const __id__Unit = __id__Bounds.isEmpty()
  ? Math.max(camera.position.length() * 0.15, 0.001)
  : Math.max(__id__Size.x, __id__Size.y, __id__Size.z, 0.000001) * 0.25;
const __id__Center = __id__Bounds.isEmpty()
  ? new THREE.Vector3()
  : __id__Bounds.getCenter(new THREE.Vector3());`;

function geometry(shape: MeshPreset['shape']) {
  switch (shape) {
    case 'box': return 'new THREE.BoxGeometry(1, 1, 1)';
    case 'sphere': return 'new THREE.SphereGeometry(0.5, 32, 24)';
    case 'cylinder': return 'new THREE.CylinderGeometry(0.5, 0.5, 1, 32)';
    case 'cone': return 'new THREE.ConeGeometry(0.5, 1, 32)';
    case 'torus': return 'new THREE.TorusGeometry(0.35, 0.15, 16, 64)';
    case 'knot': return 'new THREE.TorusKnotGeometry(0.3, 0.1, 96, 16)';
    case 'plane': return 'new THREE.PlaneGeometry(1, 1)';
    default: { const exhaustive: never = shape; return exhaustive; }
  }
}

export function buildPresetRecipe(draft: PresetDraft): FeatureRecipe {
  const recipe: FeatureRecipe = { id: draft.preset.id, kind: draft.kind === 'orbit' ? 'orbit' : 'snippet', target: presetTarget(draft.preset),
    title: draft.preset.title, description: draft.preset.description, imports: '', setup: '', frame: '', cleanup: '' };
  switch (draft.kind) {
    case 'mesh': {
      const size = number(draft.size, 0.1, 10), rotation = number(draft.rotation, -180, 180), speed = number(draft.speed, -180, 180);
      const [x, y, z] = position(draft.position);
      const scale = [draft.scale.x, draft.scale.y, draft.scale.z].map(value => number(value, 0.1, 5));
      const material = draft.material === 'normal' ? `new THREE.MeshNormalMaterial({ wireframe: ${draft.wireframe}, side: THREE.DoubleSide })`
        : draft.material === 'standard' ? `new THREE.MeshStandardMaterial({ color: ${color(draft.color)}, roughness: 0.5, wireframe: ${draft.wireframe}, side: THREE.DoubleSide })`
          : `new THREE.MeshBasicMaterial({ color: ${color(draft.color)}, wireframe: ${draft.wireframe}, side: THREE.DoubleSide })`;
      recipe.setup = `${boundsCode}
const __id__Geometry = ${geometry(draft.preset.shape)};
const __id__Material = ${material};
const __id__ = new THREE.Mesh(__id__Geometry, __id__Material);
__id__.scale.set(${scale.map(value => `__id__Unit * ${size} * ${value}`).join(', ')});
${draft.preset.shape === 'plane' ? '__id__.rotation.x = -Math.PI / 2;\n' : ''}__id__.rotation.y = THREE.MathUtils.degToRad(${rotation});
const __id__OwnBounds = new THREE.Box3().setFromObject(__id__);
__id__.position.set(
  ${draft.placement === 'beside' ? '(__id__Bounds.isEmpty() ? 0 : __id__Bounds.max.x) - __id__OwnBounds.min.x + __id__Unit * 0.25' : '__id__Center.x'} + __id__Unit * ${x},
  (__id__Bounds.isEmpty() ? 0 : __id__Bounds.min.y) - __id__OwnBounds.min.y + __id__Unit * ${y},
  __id__Center.z + __id__Unit * ${z},
);
${draft.speed ? 'const __id__Start = performance.now();\n' : ''}scene.add(__id__);`;
      recipe.frame = draft.speed ? `__id__.rotation.y = THREE.MathUtils.degToRad(${rotation} + ${speed} * (performance.now() - __id__Start) / 1000);` : '';
      recipe.cleanup = '__id__Geometry.dispose();\n__id__Material.dispose();';
      return recipe;
    }
    case 'light': {
      const intensity = number(draft.intensity, 0, 20), tint = color(draft.color);
      if (draft.preset.light === 'ambient') {
        recipe.setup = `const __id__ = new THREE.AmbientLight(${tint}, ${intensity});\nscene.add(__id__);`;
      } else {
        const [x, y, z] = position(draft.position);
        recipe.setup = `${boundsCode}
const __id__ = ${draft.preset.light === 'point' ? `new THREE.PointLight(${tint}, ${intensity} * __id__Unit ** 2, 0, 2)` : `new THREE.DirectionalLight(${tint}, ${intensity})`};
__id__.position.copy(__id__Center).add(new THREE.Vector3(${x}, ${y}, ${z}).multiplyScalar(__id__Unit));
${draft.preset.light === 'directional' ? '__id__.target.position.copy(__id__Center);\nscene.add(__id__.target);\n' : ''}scene.add(__id__);`;
      }
      recipe.cleanup = '__id__.dispose();';
      return recipe;
    }
    case 'guide': {
      const size = number(draft.size, 0.1, 10);
      const divisions = Math.round(Number(number(draft.divisions, 1, 100)));
      recipe.setup = `${boundsCode}
const __id__ = ${draft.preset.helper === 'grid' ? `new THREE.GridHelper(__id__Unit * ${size}, ${divisions}, ${color(draft.color)}, ${color(draft.color)})` : `new THREE.AxesHelper(__id__Unit * ${size})`};
__id__.position.set(__id__Center.x, __id__Bounds.isEmpty() ? 0 : __id__Bounds.min.y, __id__Center.z);
scene.add(__id__);`;
      recipe.cleanup = '__id__.dispose();';
      return recipe;
    }
    case 'orbit': {
      const damping = number(draft.damping, 0, 1), speed = number(draft.speed, -10, 10);
      recipe.imports = "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';";
      recipe.setup = `const __id__ = new OrbitControls(camera, renderer.domElement);
__id__.enableDamping = ${draft.damping > 0};
__id__.dampingFactor = ${damping};
__id__.autoRotate = ${draft.autoRotate};
__id__.autoRotateSpeed = ${speed};
__id__.enableZoom = ${draft.zoom};
__id__.enablePan = ${draft.pan};
__id__.target.copy(camera.getWorldDirection(new THREE.Vector3())
  .multiplyScalar(camera.position.length()).add(camera.position));
__id__.update();`;
      recipe.frame = '__id__.update();'; recipe.cleanup = '__id__.dispose();';
      return recipe;
    }
    case 'camera': {
      recipe.setup = `if (camera instanceof THREE.PerspectiveCamera) camera.fov = ${number(draft.fov, 10, 120)};
camera.zoom = ${number(draft.zoom, 0.2, 5)};
camera.updateProjectionMatrix();`;
      return recipe;
    }
    default: { const exhaustive: never = draft; return exhaustive; }
  }
}
