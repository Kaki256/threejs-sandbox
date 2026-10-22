function sceneSource(setup: string, animate: string, cleanup: string, extraImport = '') {
  const indent = (value: string) => value.split('\n').map(line => `  ${line}`).join('\n');
  return `<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import * as THREE from 'three/webgpu';
${extraImport}
const canvas = useTemplateRef<HTMLCanvasElement>('canvas');
const errorMessage = ref('');
let unmounted = false;
let disposeScene: (() => void) | undefined;

onMounted(async () => {
  const element = canvas.value;
  if (!element) return;
  const renderer = new THREE.WebGPURenderer({ canvas: element });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(960, 540);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1220);
  const camera = new THREE.PerspectiveCamera(45, 960 / 540, 1, 10000);
  camera.position.set(0, 0, 1000);

${indent(setup)}

  let initialized = false;
  function dispose() {
${indent(indent(cleanup))}
    if (initialized) renderer.dispose();
  }
  try {
    await renderer.init();
    initialized = true;
    if (unmounted) { dispose(); return; }
    disposeScene = dispose;
    await renderer.setAnimationLoop(() => {
${indent(indent(indent(animate)))}
      renderer.render(scene, camera);
    });
  } catch (error) {
    dispose();
    if (!unmounted) errorMessage.value = error instanceof Error ? error.message : String(error);
  }
});
onUnmounted(() => { unmounted = true; disposeScene?.(); });
</script>

<template>
  <section class="stage">
    <canvas ref="canvas" />
    <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
  </section>
</template>

<style scoped>
.stage { width: 100%; }
canvas { display: block; width: 100%; height: auto; }
p { padding: 16px; color: #fca5a5; }
</style>
`;
}

export const sandboxTemplates = [
  {
    id: 'box', title: '回転する箱', description: '大きさと回転速度から変えてみる。',
    source: sceneSource(
      'const geometry = new THREE.BoxGeometry(400, 400, 400);\nconst material = new THREE.MeshNormalMaterial();\nconst box = new THREE.Mesh(geometry, material);\nscene.add(box);',
      'box.rotation.x += 0.005;\nbox.rotation.y += 0.01;',
      'geometry.dispose();\nmaterial.dispose();'),
  },
  {
    id: 'sphere', title: '光と球体', description: '色・材質・光の当て方を試す。',
    source: sceneSource(
      'const geometry = new THREE.SphereGeometry(280, 32, 32);\nconst material = new THREE.MeshStandardMaterial({\n  color: 0xff6644, roughness: 0.4, metalness: 0.1\n});\nconst sphere = new THREE.Mesh(geometry, material);\nscene.add(sphere);\nconst light = new THREE.DirectionalLight(0xffffff, 3);\nlight.position.set(1, 2, 3);\nscene.add(light, new THREE.AmbientLight(0xffffff, 0.25));',
      'sphere.rotation.y += 0.005;',
      'geometry.dispose();\nmaterial.dispose();\nlight.dispose();'),
  },
  {
    id: 'orbit', title: '視点を動かす', description: 'ドラッグで眺めながら形を作る。',
    source: sceneSource(
      'const geometry = new THREE.TorusKnotGeometry(200, 55, 100, 16);\nconst material = new THREE.MeshNormalMaterial();\nscene.add(new THREE.Mesh(geometry, material));\nconst controls = new OrbitControls(camera, element);\ncontrols.enableDamping = true;\ncontrols.dampingFactor = 0.1;',
      'controls.update();',
      'controls.dispose();\ngeometry.dispose();\nmaterial.dispose();',
      "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';\n"),
  },
  {
    id: 'group', title: '親子構造', description: '配置したオブジェクトを一緒に動かす。',
    source: sceneSource(
      'camera.position.set(450, 400, 1000);\ncamera.lookAt(0, 0, 0);\nconst group = new THREE.Group();\nscene.add(group);\nconst geometry = new THREE.SphereGeometry(45, 24, 24);\nconst material = new THREE.MeshNormalMaterial();\nfor (let i = 0; i < 10; i++) {\n  const sphere = new THREE.Mesh(geometry, material);\n  const angle = i / 10 * Math.PI * 2;\n  sphere.position.set(280 * Math.cos(angle), 0, 280 * Math.sin(angle));\n  group.add(sphere);\n}',
      'group.rotation.y += 0.01;',
      'geometry.dispose();\nmaterial.dispose();'),
  },
  {
    id: 'blank', title: '空のシーン', description: '座標の目印を使って自由に始める。',
    source: sceneSource(
      'camera.position.set(600, 450, 900);\ncamera.lookAt(0, 0, 0);\nconst grid = new THREE.GridHelper(1200, 12, 0x4375b0, 0x24364e);\nconst axes = new THREE.AxesHelper(300);\nscene.add(grid, axes);\n\n// ここに自分のメッシュを追加します。',
      '// ここで位置や回転を更新できます。',
      'grid.geometry.dispose();\ngrid.material.dispose();\naxes.geometry.dispose();\naxes.material.dispose();'),
  },
];
