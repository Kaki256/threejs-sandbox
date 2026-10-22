import { STLLoader } from 'three/addons/loaders/STLLoader.js';

export const maxStlBytes = 1024 * 1024;
export const providedStlName = '260720_3dPrintModel_4cm.stl';

export function createStlSource(buffer: ArrayBuffer, fileName: string) {
  if (buffer.byteLength > maxStlBytes) throw new Error('1 MB 以下の STL ファイルを選んでください。');
  const bytes = new Uint8Array(buffer);
  const binary = bytes.length >= 84 && 84 + 50 * new DataView(buffer).getUint32(80, true) === bytes.length;
  const header = new TextDecoder().decode(bytes.subarray(0, 128)).trimStart();
  if (!binary && !/^solid(?:\s|$)/.test(header)) throw new Error('STL の形式を読み取れません。バイナリー STL または ASCII STL を選んでください。');
  const geometry = new STLLoader().parse(binary ? buffer : new TextDecoder().decode(bytes).trimStart());
  try {
    const positions = geometry.getAttribute('position');
    if (!positions || positions.count < 3 || positions.count % 3 !== 0 || !Array.from(positions.array).every(Number.isFinite)) throw new Error('表示できる三角形がありません。STL の頂点データを確認してください。');
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds || bounds.isEmpty()) throw new Error('モデルの大きさを読み取れませんでした。');
    const size = [bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z];
    if (!size.every(Number.isFinite) || Math.max(...size) <= 0) throw new Error('モデルの大きさが不正です。');
    let encoded = '';
    for (let start = 0; start < bytes.length; start += 8192) encoded += String.fromCharCode(...bytes.subarray(start, start + 8192));
    const base64 = btoa(encoded);
    const triangles = positions.count / 3;
    const name = JSON.stringify(fileName).replaceAll('<', '\\u003c');
    const source = `<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import * as THREE from 'three/webgpu';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// まずは色・ワイヤーフレーム・自動回転を変えてみましょう。
const color = ref('#65c9c1');
const wireframe = ref(false);
const autoRotate = ref(false);
const fileName = ${name};
const canvas = useTemplateRef<HTMLCanvasElement>('canvas');
const errorMessage = ref('');
let material: THREE.MeshStandardMaterial | undefined;
let controls: OrbitControls | undefined;
let resetCamera: (() => void) | undefined;
let disposeScene: (() => void) | undefined;
let unmounted = false;

watch(color, value => material?.color.set(value));
watch(wireframe, value => { if (material) material.wireframe = value; });
watch(autoRotate, value => { if (controls) controls.autoRotate = value; });

onMounted(async () => {
  const element = canvas.value;
  if (!element) return;
  // STL の元データを復元。末尾のデータもコードと一緒に保存されます。
  const data = Uint8Array.from(atob(stlBase64), char => char.charCodeAt(0));
  const geometry = new STLLoader().parse(${binary ? 'data.buffer' : 'new TextDecoder().decode(data).trimStart()'});
  // CAD でよく使う Z-up を Three.js の Y-up に合わせます。
  // 向きを変える練習では、この行をコメントアウトして比較できます。
  geometry.rotateX(-Math.PI / 2);
  geometry.center();
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox?.getSize(size);
  const extent = Math.max(size.x, size.y, size.z);
  const renderer = new THREE.WebGPURenderer({ canvas: element, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(960, 540);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101b2c);
  const camera = new THREE.PerspectiveCamera(40, 960 / 540, extent / 1000, extent * 100);
  material = new THREE.MeshStandardMaterial({ color: color.value, roughness: 0.5, metalness: 0.08, wireframe: wireframe.value, flatShading: true });
  const model = new THREE.Mesh(geometry, material);
  model.position.y = size.y / 2;
  scene.add(model);
  const ambient = new THREE.HemisphereLight(0xe7f1ff, 0x324356, 2.2);
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(extent * 2, extent * 3, extent * 2);
  scene.add(ambient, light);
  const grid = new THREE.GridHelper(extent * 2.5, 10, 0x426788, 0x23364d);
  const axes = new THREE.AxesHelper(extent * 0.55);
  scene.add(grid, axes);
  controls = new OrbitControls(camera, element);
  controls.enableDamping = true;
  controls.autoRotate = autoRotate.value;
  controls.autoRotateSpeed = 1.5;
  controls.minDistance = extent * 0.2;
  controls.maxDistance = extent * 12;
  resetCamera = () => {
    camera.position.set(extent * 1.35, extent * 1.1, extent * 1.7);
    controls?.target.set(0, size.y * 0.4, 0);
    controls?.update();
  };
  resetCamera();
  let initialized = false;
  function dispose() {
    controls?.dispose();
    geometry.dispose(); material?.dispose();
    grid.geometry.dispose(); grid.material.dispose();
    axes.dispose();
    ambient.dispose(); light.dispose();
    if (initialized) renderer.dispose();
  }
  try {
    await renderer.init();
    initialized = true;
    if (unmounted) { dispose(); return; }
    disposeScene = dispose;
    await renderer.setAnimationLoop(() => {
      controls?.update();
      renderer.render(scene, camera);
    });
  } catch (error) {
    dispose();
    if (!unmounted) errorMessage.value = error instanceof Error ? error.message : String(error);
  }
});
onUnmounted(() => { unmounted = true; disposeScene?.(); });

// #region STLデータ（編集不要・折りたたみ可）
const stlBase64 = '${base64}';
// #endregion
</script>

<template>
  <section class="stl-stage">
    <div class="stl-controls">
      <label>色 <input v-model="color" type="color" /></label>
      <label><input v-model="wireframe" type="checkbox" />ワイヤーフレーム</label>
      <label><input v-model="autoRotate" type="checkbox" />自動回転</label>
      <button type="button" @click="resetCamera?.()">視点を戻す</button>
    </div>
    <canvas ref="canvas" />
    <p class="stl-caption">{{ fileName }} · ${triangles} triangles · ドラッグで回転 / ホイールで拡大</p>
    <p v-if="errorMessage" class="stl-error" role="alert">{{ errorMessage }}</p>
  </section>
</template>

<style scoped>
.stl-stage { width: 100%; color: #d7e5f7; }
.stl-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 12px 16px; background: #18263a; font-size: 12px; }
.stl-controls label { display: flex; align-items: center; gap: 5px; }
input[type="color"] { width: 30px; height: 24px; padding: 0; border: 0; background: none; }
input[type="checkbox"] { accent-color: #65c9c1; }
button { border: 1px solid #50647d; border-radius: 5px; padding: 5px 9px; color: #e2efff; background: #243950; cursor: pointer; }
canvas { display: block; width: 100%; height: auto; touch-action: none; }
.stl-caption { padding: 10px 16px; color: #94abc6; font-size: 11px; overflow-wrap: anywhere; }
.stl-error { padding: 12px 16px; color: #fca5a5; }
</style>
`;
    return { source, triangles, size };
  } finally { geometry.dispose(); }
}
