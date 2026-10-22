<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { constrainPosition, initialRoomsState, moveRoomItem, parseRoomsState, pitchLimit, roomIds, roomItems, roomsStorageKey, rotateRoom } from '../rooms/model';
import type { ItemId, Point, RoomId, RoomsState } from '../rooms/model';
import type { createRoomsScene, RoomLabel } from '../rooms/scene';
import './rooms.css';

const state = shallowRef<RoomsState>(initialRoomsState());
const activeRoom = ref<RoomId>(0), rotateTouch = ref(false), ready = ref(false), error = ref(''), saveNotice = ref('この端末に自動保存');
const labels = shallowRef<RoomLabel[]>([]), past = shallowRef<RoomsState[]>([]), future = shallowRef<RoomsState[]>([]);
const selected = computed(() => roomItems.find(item => item.id === state.value.selected));
const position = computed(() => selected.value ? state.value.positions[selected.value.id] : null);
const rotation = computed(() => state.value.rotations[activeRoom.value]);
const surface = useTemplateRef<HTMLCanvasElement>('surface'), scroller = useTemplateRef<HTMLElement>('scroller');
let scene: ReturnType<typeof createRoomsScene> | undefined;
let observer: ResizeObserver | undefined, saveTimer: ReturnType<typeof setTimeout> | undefined, frame = 0, lastTime = 0, disposed = false;
const held = new Set<string>();
type Gesture = { id: number; kind: 'select'; x: number; y: number } | { id: number; kind: 'rotate'; x: number; y: number; room: RoomId; yaw: number; pitch: number };
let gesture: Gesture | null = null;
const directions = new Map<string, { x: number; up: number }>([
  ['w', { x: 0, up: 1 }], ['arrowup', { x: 0, up: 1 }], ['s', { x: 0, up: -1 }], ['arrowdown', { x: 0, up: -1 }],
  ['a', { x: -1, up: 0 }], ['arrowleft', { x: -1, up: 0 }], ['d', { x: 1, up: 0 }], ['arrowright', { x: 1, up: 0 }],
]);
function render() { scene?.render(state.value, activeRoom.value); }
function record() { past.value = [...past.value.slice(-49), state.value]; future.value = []; }
function history(direction: 'undo' | 'redo') {
  stopMovement();
  const stack = direction === 'undo' ? past : future, other = direction === 'undo' ? future : past;
  const previous = stack.value.at(-1); if (!previous) return;
  other.value = [...other.value, state.value]; stack.value = stack.value.slice(0, -1); state.value = previous;
}
function select(id: ItemId) { stopMovement(); state.value = { ...state.value, selected: id }; }
function focusRoom(id: RoomId) {
  activeRoom.value = id;
  const element = scroller.value;
  if (element) element.scrollTo({ left: element.scrollWidth * (id + 0.5) / 5 - element.clientWidth / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
function showEditableRoom() { focusRoom(0); scroller.value?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
function move(dx: number, up: number, distance: number) {
  if (!selected.value || !scene) return;
  const delta = scene.movement(dx, up);
  state.value = moveRoomItem(state.value, selected.value.id, { x: delta.x * distance, z: delta.z * distance });
}
function tick(time: number) {
  frame = 0;
  if (!held.size || !selected.value) { lastTime = 0; return; }
  let dx = 0, up = 0;
  for (const key of held) { const direction = directions.get(key); if (direction) { dx += direction.x; up += direction.up; } }
  if (dx || up) move(dx, up, Math.min((time - (lastTime || time - 16)) / 1000, 0.04) * 2.2);
  lastTime = time; frame = requestAnimationFrame(tick);
}
function startMovement(key: string) {
  if (!selected.value || held.has(key)) return;
  if (!held.size) { record(); lastTime = 0; }
  held.add(key); if (!frame) frame = requestAnimationFrame(tick);
}
function stopMovement() { held.clear(); cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
function keydown(event: KeyboardEvent) {
  if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); history(event.shiftKey ? 'redo' : 'undo'); return; }
  if (event.ctrlKey || event.metaKey || event.altKey || !directions.has(key) || !selected.value) return;
  event.preventDefault(); startMovement(key);
}
function keyup(event: KeyboardEvent) { held.delete(event.key.toLowerCase()); if (!held.size) stopMovement(); }
function holdButton(event: PointerEvent, key: string) {
  if (event.button !== 0) return;
  event.preventDefault();
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.setPointerCapture(event.pointerId);
  startMovement(key);
}
function clickButton(event: MouseEvent, key: string) {
  if (event.detail !== 0 || !selected.value) return;
  const direction = directions.get(key); if (!direction) return;
  record(); move(direction.x, direction.up, 0.22);
}
function pointerDown(event: PointerEvent) {
  if (!scene || !surface.value || (event.button !== 0 && event.button !== 2)) return;
  stopMovement();
  const room = scene.pickRoom(event.clientX, event.clientY);
  if (room !== null) activeRoom.value = room;
  if (event.button === 2 || event.pointerType === 'touch' && rotateTouch.value) {
    event.preventDefault(); record();
    const id = room ?? activeRoom.value, current = state.value.rotations[id];
    gesture = { id: event.pointerId, kind: 'rotate', x: event.clientX, y: event.clientY, room: id, yaw: current.yaw, pitch: current.pitch };
    surface.value.setPointerCapture(event.pointerId);
  } else gesture = { id: event.pointerId, kind: 'select', x: event.clientX, y: event.clientY };
}
function pointerMove(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId || gesture.kind !== 'rotate') return;
  state.value = rotateRoom(state.value, gesture.room, { yaw: gesture.yaw + (event.clientX - gesture.x) * 0.009, pitch: gesture.pitch + (event.clientY - gesture.y) * 0.007 });
}
function pointerUp(event: PointerEvent) {
  if (gesture?.id !== event.pointerId) return;
  if (gesture.kind === 'select' && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 7) {
    const id = scene?.pickItem(event.clientX, event.clientY); if (id) select(id);
    surface.value?.focus({ preventScroll: true });
  }
  gesture = null;
}
function cancelPointer() { gesture = null; }
function setCoordinate(axis: keyof Point, event: Event) {
  if (!(event.target instanceof HTMLInputElement) || !selected.value) return;
  const value = event.target.valueAsNumber;
  if (!Number.isFinite(value)) { event.target.value = String(state.value.positions[selected.value.id][axis]); return; }
  record(); const id = selected.value.id;
  state.value = { ...state.value, positions: { ...state.value.positions, [id]: constrainPosition({ ...state.value.positions[id], [axis]: value }) } };
}
function resetItem() {
  if (!selected.value) return; record(); const id = selected.value.id;
  state.value = { ...state.value, positions: { ...state.value.positions, [id]: initialRoomsState().positions[id] } };
}
function resetRoom() { record(); state.value = { ...state.value, rotations: { ...state.value.rotations, [activeRoom.value]: initialRoomsState().rotations[activeRoom.value] } }; }
function resetAll() { stopMovement(); record(); state.value = initialRoomsState(); }
function allLinks(event: Event) { if (event.target instanceof HTMLInputElement) state.value = { ...state.value, allLinks: event.target.checked }; }
watch([state, activeRoom], render);
watch(state, () => {
  saveNotice.value = '保存中…'; clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 250);
});
function persist() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(roomsStorageKey, JSON.stringify(state.value)); saveNotice.value = 'この端末に保存済み'; }
  catch { saveNotice.value = '保存できません。ページを閉じると配置が失われます。'; }
}
onMounted(async () => {
  try {
    const stored = localStorage.getItem(roomsStorageKey);
    if (stored) { const parsed = parseRoomsState(JSON.parse(stored)); if (parsed) state.value = parsed; else saveNotice.value = '前の保存データを読めなかったため、初期配置を表示しています。'; }
  } catch { saveNotice.value = '保存データを読み込めませんでした。'; }
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', stopMovement);
  try {
    const { createRoomsScene } = await import('../rooms/scene');
    if (disposed || !surface.value) return;
    scene = createRoomsScene(surface.value, value => { labels.value = value; });
    observer = new ResizeObserver(() => { scene?.resize(); render(); }); observer.observe(surface.value);
    scene.resize(); render(); ready.value = true;
  } catch (value) { error.value = value instanceof Error ? value.message : String(value); }
});
onUnmounted(() => {
  disposed = true; stopMovement(); observer?.disconnect(); scene?.dispose(); persist();
  window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', stopMovement);
});
</script>

<template>
  <section class="rooms-playground" :class="{ 'has-selection': selected }" aria-labelledby="rooms-title">
    <header class="rooms-heading"><div><p class="rooms-eyebrow">LINKED ROOMS / THREE.JS</p><h1 id="rooms-title">小部屋をつないで、動かす。</h1><p>小部屋1〜4のアイテムを、小部屋0に集めました。選んで動かすと、対応する小部屋のアイテムも同じ相対位置へ動きます。</p></div><span class="rooms-save" role="status">{{ saveNotice }}</span></header>
    <div class="rooms-topbar"><nav aria-label="小部屋へ移動"><button v-for="id in roomIds" :key="id" type="button" :aria-pressed="activeRoom === id" @click="focusRoom(id)">小部屋{{ id }}<small>{{ id === 0 ? '動かす' : '元のアイテム' }}</small></button></nav><div class="rooms-view-actions"><label><input type="checkbox" :checked="state.allLinks" @change="allLinks" />すべてのリンク</label><button type="button" :aria-pressed="rotateTouch" @click="rotateTouch = !rotateTouch">{{ rotateTouch ? '指で部屋を回す：ON' : '指で部屋を回す' }}</button></div></div>
    <div class="rooms-stage-heading"><span><i class="rooms-origin-mark" />同じIDのアイテムは、部屋内の位置が連動します</span><span>横スクロールで小部屋1〜4へ →</span></div>
    <div ref="scroller" class="rooms-scroller" aria-label="横一列に並んだ5つの小部屋">
      <div class="rooms-stage" :class="{ 'rooms-touch-rotate': rotateTouch }">
        <div class="rooms-room-headings" aria-hidden="true"><div v-for="id in roomIds" :key="id"><strong>小部屋{{ id }}</strong><span>{{ id === 0 ? '8つのアイテムを自由に配置' : '小部屋0と位置を同期' }}</span></div></div>
        <div class="rooms-canvas-wrap">
          <canvas ref="surface" tabindex="0" aria-label="小部屋0のアイテムをクリックして選択。WASDまたは矢印キーで移動。右ドラッグで部屋を回転。" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="cancelPointer" @lostpointercapture="cancelPointer" @contextmenu.prevent />
          <span v-for="label in labels" :key="label.key" class="rooms-item-label" :class="{ 'is-selected': label.selected }" :data-item="label.key" :style="{ left: `${label.x}px`, top: `${label.y}px` }">{{ label.id.toUpperCase() }}</span>
          <p v-if="!ready && !error" class="rooms-loading" role="status">小部屋を準備しています…</p>
          <p v-if="error" class="rooms-loading rooms-error" role="alert">3D表示を開始できませんでした。{{ error }}</p>
        </div>
      </div>
    </div>
    <div class="rooms-caption"><span>クリックで選択 · WASD / ↑↓←→ で移動</span><span>右ドラッグで部屋を回転 · カメラは固定</span></div>
    <div class="rooms-control-grid">
      <section class="rooms-items-panel" aria-labelledby="rooms-items-title"><div class="rooms-panel-title"><h2 id="rooms-items-title">小部屋0のアイテム</h2><span>出身の小部屋ごとに色分け</span></div><div class="rooms-item-choices"><button v-for="item in roomItems" :key="item.id" type="button" :aria-pressed="state.selected === item.id" :aria-label="`${item.id.toUpperCase()} ${item.name}を選択`" @click="select(item.id)"><span class="rooms-item-dot" :style="{ background: item.color }" /><span><strong>{{ item.id.toUpperCase() }} {{ item.name }}</strong><small>小部屋{{ item.room }}とリンク</small></span></button></div></section>
      <section class="rooms-movement-panel" aria-labelledby="rooms-selected-title"><div class="rooms-panel-title"><h2 id="rooms-selected-title">{{ selected ? `${selected.id.toUpperCase()} · ${selected.name}` : '動かすアイテムを選ぶ' }}</h2><button v-if="selected" type="button" @click="focusRoom(0)">小部屋0へ ↗</button></div><p class="rooms-selection-note">{{ selected ? `小部屋${selected.room}の同じアイテムと位置を同期中。画面の方向に、床の上を移動します。` : '立体をクリックするか、アイテム一覧から選んでください。' }}</p><div class="rooms-move-controls"><div class="rooms-dpad" role="group" aria-label="選んだアイテムを移動"><button type="button" class="move-up" :disabled="!selected" aria-label="上へ移動" @pointerdown="holdButton($event, 'w')" @pointerup="stopMovement" @pointercancel="stopMovement" @lostpointercapture="stopMovement" @click="clickButton($event, 'w')">↑<small>W</small></button><button type="button" class="move-left" :disabled="!selected" aria-label="左へ移動" @pointerdown="holdButton($event, 'a')" @pointerup="stopMovement" @pointercancel="stopMovement" @lostpointercapture="stopMovement" @click="clickButton($event, 'a')">←<small>A</small></button><button type="button" class="move-right" :disabled="!selected" aria-label="右へ移動" @pointerdown="holdButton($event, 'd')" @pointerup="stopMovement" @pointercancel="stopMovement" @lostpointercapture="stopMovement" @click="clickButton($event, 'd')">→<small>D</small></button><button type="button" class="move-down" :disabled="!selected" aria-label="下へ移動" @pointerdown="holdButton($event, 's')" @pointerup="stopMovement" @pointercancel="stopMovement" @lostpointercapture="stopMovement" @click="clickButton($event, 's')">↓<small>S</small></button></div><div class="rooms-coordinate-fields"><template v-if="position"><label>部屋内 X<input type="number" step="0.1" min="-2.4" max="2.4" :value="position.x.toFixed(2)" @change="setCoordinate('x', $event)" /></label><label>部屋内 Z<input type="number" step="0.1" min="-1.9" max="1.9" :value="position.z.toFixed(2)" @change="setCoordinate('z', $event)" /></label><button type="button" @click="resetItem">このアイテムの位置を戻す</button></template><span v-else>選択すると位置を表示します</span></div></div></section>
    </div>
    <footer class="rooms-footer"><div class="rooms-history"><button type="button" :disabled="!past.length" title="Ctrl / ⌘ + Z" @click="history('undo')">↶ 一手戻る</button><button type="button" :disabled="!future.length" title="Ctrl / ⌘ + Shift + Z" @click="history('redo')">↷ やり直す</button><button type="button" @click="resetAll">すべて初期配置に戻す</button></div><div class="rooms-rotation-state"><span>回転対象：小部屋{{ activeRoom }} · 横 {{ Math.round(rotation.yaw * 180 / Math.PI) }}° / 傾き {{ Math.round(rotation.pitch * 180 / Math.PI) }}°</span><button type="button" @click="resetRoom">この部屋の向きを戻す</button></div><p>右ドラッグは、その場所の部屋だけを回します。スマホでは「指で部屋を回す」をONにしてドラッグ。傾きは±{{ Math.round(pitchLimit * 180 / Math.PI) }}°までで、床の下からは見えません。配置はブラウザごとに保存されます。</p></footer>
    <div v-if="selected" class="rooms-mobile-pad" role="group" aria-label="スマホ用の移動操作"><div><strong>{{ selected.id.toUpperCase() }} · {{ selected.name }}</strong><button type="button" @click="showEditableRoom">小部屋0を表示 ↑</button></div><div><button v-for="direction in [{ key: 'a', arrow: '←', label: '左' }, { key: 'w', arrow: '↑', label: '上' }, { key: 's', arrow: '↓', label: '下' }, { key: 'd', arrow: '→', label: '右' }]" :key="direction.key" type="button" :aria-label="`${direction.label}へ移動（スマホ）`" @pointerdown="holdButton($event, direction.key)" @pointerup="stopMovement" @pointercancel="stopMovement" @lostpointercapture="stopMovement" @click="clickButton($event, direction.key)">{{ direction.arrow }}</button></div></div>
  </section>
</template>
