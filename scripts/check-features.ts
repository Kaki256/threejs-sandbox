import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { featureRecipes, parseCustomRecipe } from '../src/sandbox/feature-recipes';
import { applyFeature } from '../src/sandbox/features';
import { sandboxTemplates } from '../src/sandbox/templates';
import { createStlSource } from '../src/sandbox/stl';
import { analyzeSections } from '../src/sandbox/sections';
import type { SectionKind } from '../src/sandbox/section-guide';
import { buildPresetRecipe, createPresetDraft, featurePresets } from '../src/sandbox/feature-presets';
import * as THREE from 'three';

const box = featureRecipes.find(recipe => recipe.id === 'box');
const orbit = featureRecipes.find(recipe => recipe.id === 'orbit');
assert(box && orbit);
const model = readFileSync(new URL('../src/assets/models/260720_3dPrintModel_4cm.stl', import.meta.url));
const stl = createStlSource(Uint8Array.from(model).buffer, 'model.stl').source;
const sources = [...sandboxTemplates.map(template => template.source), stl];
for (const source of sources) {
  function roleAt(code: string, text: string): SectionKind | undefined {
    const index = code.indexOf(text); assert(index >= 0, `Expected code: ${text}`);
    const line = code.slice(0, index).split('\n').length;
    return analyzeSections(code).find(section => section.startLine <= line && line <= section.endLine)?.kind;
  }
  const sections = analyzeSections(source);
  assert.equal(sections.filter(section => section.target === 'items').length, 1);
  assert.equal(sections.filter(section => section.target === 'camera').length, 1);
  assert.equal(roleAt(source, 'new THREE.PerspectiveCamera'), 'camera');
  assert.equal(roleAt(source, 'function dispose()'), 'cleanup');
  assert.equal(roleAt(source, 'renderer.render(scene, camera)'), 'animation');
  assert.equal(roleAt(source, '<canvas ref="canvas"'), 'template');
  const result = applyFeature(source, box);
  assert(result.kind === 'applied', result.kind === 'error' ? result.message : '箱が追加される');
  assert(result.source.includes('const addedFeature1 = new THREE.Mesh'));
  assert.equal(roleAt(result.source, 'const addedFeature1 = new THREE.Mesh'), 'items');
  // Removing exactly the highlighted additions must reproduce every original byte.
  let original = result.source;
  for (const range of [...result.ranges].sort((a, b) => b.start - a.start)) original = original.slice(0, range.start) + original.slice(range.end);
  assert.equal(original, source);
  const second = applyFeature(result.source, box);
  assert(second.kind === 'applied');
  assert(second.source.includes('const addedFeature2 = new THREE.Mesh'));
  const controls = applyFeature(result.source, orbit);
  assert(controls.kind !== 'error', controls.kind === 'error' ? controls.message : '視点移動を追加または表示');
  const repeated = applyFeature(controls.source, orbit);
  assert.equal(repeated.kind, 'existing');
  assert.equal(repeated.source, controls.source);
}
const first = sources[0];
assert(first);
const custom = { ...box, id: 'custom-example01', setup: 'const __id__ = 0.01;', frame: 'camera.rotation.y += __id__;', cleanup: '', imports: '' };
const parsed = parseCustomRecipe(custom);
assert(parsed);
assert.equal(applyFeature(first, parsed).kind, 'applied');
const withImport = applyFeature(first, { ...custom, imports: "import { Vector3 as __id__Vector } from 'three/webgpu';", setup: 'const __id__ = new __id__Vector();' });
assert(withImport.kind === 'applied');
assert(withImport.source.includes('Vector3 as addedFeature1Vector'));
assert(withImport.source.includes('new addedFeature1Vector()'));
assert.equal(parseCustomRecipe({ ...custom, setup: null }), undefined);
assert.equal(parseCustomRecipe({ ...custom, target: undefined })?.target, 'items');
assert.equal(parseCustomRecipe({ ...custom, target: 'camera' })?.target, 'camera');
assert.equal(parseCustomRecipe({ ...custom, target: 'unknown' }), undefined);
assert.equal(applyFeature('<template><p>自由なHTML</p></template>', box).kind, 'error');
assert.equal(applyFeature(first, { ...custom, setup: 'const = ;' }).kind, 'error');
assert.equal(applyFeature(first.replace('const scene =', 'const myScene ='), box).kind, 'error');
const crlf = first.replaceAll('\n', '\r\n');
assert.equal(applyFeature(crlf, box).kind, 'applied');
const compact = first.replaceAll('\n', ' ').replace('// ここ', '');
assert.equal(applyFeature(compact, orbit).kind, 'applied');
assert.doesNotThrow(() => analyzeSections(first.replace('const geometry =', 'const geometry = ;')));
for (const preset of featurePresets) {
  const draft = createPresetDraft(preset);
  switch (draft.kind) {
    case 'mesh': draft.size = 1.7; draft.color = '#d46a32'; draft.position = { x: -2, y: 0.5, z: 1 }; draft.rotation = 37; draft.speed = -25; draft.scale.y = 2; draft.material = 'standard'; draft.wireframe = true; break;
    case 'light': draft.intensity = 4.5; draft.color = '#ffddaa'; draft.position = { x: 2, y: 4, z: -3 }; break;
    case 'guide': draft.size = 6; draft.divisions = 24; draft.color = '#336699'; break;
    case 'orbit': draft.damping = 0.2; draft.autoRotate = true; draft.speed = -3; draft.zoom = false; draft.pan = false; break;
    case 'camera': draft.fov = 65; draft.zoom = 1.4; break;
    default: { const exhaustive: never = draft; throw new Error(String(exhaustive)); }
  }
  const recipe = buildPresetRecipe(draft);
  for (const source of sources) {
    for (const addition of [recipe, buildPresetRecipe(createPresetDraft(preset))]) {
      const result = applyFeature(source, addition);
      assert.notEqual(result.kind, 'error', result.kind === 'error' ? `${preset.id}: ${result.message}` : preset.id);
      if (result.kind === 'applied') {
        let retained = result.source;
        for (const range of [...result.ranges].sort((a, b) => b.start - a.start)) retained = retained.slice(0, range.start) + retained.slice(range.end);
        assert.equal(retained, source, `${preset.id}: retain all original source and STL data`);
        assert.notEqual(applyFeature(result.source, addition).kind, 'error', `${preset.id}: repeat addition`);
      }
    }
  }
  // Execute the actual generated geometry/light/helper and cleanup with real Three.js objects at both model scales.
  if (draft.kind !== 'orbit') for (const extent of [0.12, 400]) {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, extent * 3);
    const original = new THREE.Mesh(new THREE.BoxGeometry(extent, extent, extent), new THREE.MeshNormalMaterial());
    scene.add(original);
    const item: unknown = new Function('THREE', 'scene', 'camera', recipe.setup + '\n' + recipe.frame + '\n' + recipe.cleanup
      + (draft.kind === 'camera' ? '\nreturn camera;' : '\nreturn __id__;'))(THREE, scene, camera);
    if (draft.kind === 'mesh') {
      assert(item instanceof THREE.Mesh);
      assert(item.material instanceof THREE.MeshStandardMaterial);
      assert.equal(item.material.color.getHexString(), 'd46a32');
      assert.equal(item.material.wireframe, true);
      assert(Math.abs(item.scale.x - extent / 4 * 1.7) < extent * 1e-6);
      assert(Math.abs(item.scale.y - extent / 4 * 1.7 * 2) < extent * 1e-6);
      assert(Number.isFinite(item.position.y));
    } else if (draft.kind === 'light') {
      assert(item instanceof THREE.Light);
      assert.equal(item.color.getHexString(), 'ffddaa');
      const expected: number = draft.preset.light === 'point' ? 4.5 * (extent / 4) ** 2 : 4.5;
      assert(Math.abs(item.intensity - expected) < expected * 1e-6);
    } else if (draft.kind === 'guide') {
      assert(item instanceof THREE.GridHelper || item instanceof THREE.AxesHelper);
      const size = new THREE.Box3().setFromObject(item).getSize(new THREE.Vector3());
      assert(Math.abs(size.x - extent / 4 * 6) < extent * 1e-5);
    } else if (draft.kind === 'camera') {
      assert.equal(camera.fov, 65); assert.equal(camera.zoom, 1.4);
    }
    original.geometry.dispose(); original.material.dispose();
  }
}
const boxPreset = featurePresets.find(preset => preset.id === 'box');
assert(boxPreset);
const configuredBox = createPresetDraft(boxPreset);
assert(configuredBox.kind === 'mesh');
configuredBox.size = NaN;
assert.throws(() => buildPresetRecipe(configuredBox));
configuredBox.size = 1; configuredBox.position.x = Infinity;
assert.throws(() => buildPresetRecipe(configuredBox));
configuredBox.position.x = 0; configuredBox.color = "'); alert(1); //";
assert.throws(() => buildPresetRecipe(configuredBox));
console.log(`Feature checks passed: ${featurePresets.length} presets × defaults/edited parameters × 5 starters + STL; actual Three.js geometry, materials, lights, helpers, camera and cleanup at small/large scales; preserved source, undo ranges, repeated additions, custom buttons and invalid inputs.`);
