import * as THREE from 'three';
import { cameraElevation, roomDepth, roomHeight, roomIds, roomItems, roomSpacing, roomWidth } from './model';
import type { ItemId, Point, RoomId, RoomsState } from './model';

export interface RoomLabel { key: string; id: ItemId; room: RoomId; x: number; y: number; selected: boolean }
export function createRoomsScene(canvas: HTMLCanvasElement, updateLabels: (labels: RoomLabel[]) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0xf6f7fa, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-21, 21, 7.5, -7.5, 0.1, 100);
  camera.position.set(0, 40 * Math.sin(cameraElevation), 40 * Math.cos(cameraElevation));
  camera.lookAt(0, 0.8, 0); camera.updateMatrixWorld();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb3bbc9, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(-10, 18, 12); scene.add(light);
  const geometry = {
    box: new THREE.BoxGeometry(0.8, 0.8, 0.8), sphere: new THREE.SphereGeometry(0.44, 24, 16),
    cone: new THREE.ConeGeometry(0.46, 0.95, 24), torus: new THREE.TorusGeometry(0.33, 0.13, 12, 32),
  };
  const heights = { box: 0.4, sphere: 0.44, cone: 0.475, torus: 0.46 };
  const wallGeometry = new THREE.BoxGeometry(roomWidth, roomHeight, roomDepth);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f2ed, roughness: 0.9, side: THREE.BackSide });
  const floorGeometry = new THREE.PlaneGeometry(roomWidth, roomDepth);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xe7e7e3, roughness: 1 });
  const selectedFloor = new THREE.MeshStandardMaterial({ color: 0xe5edf4, roughness: 1 });
  const ringGeometry = new THREE.RingGeometry(0.53, 0.6, 40);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x385b7b, side: THREE.DoubleSide, depthWrite: false });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xc7c9c9, transparent: true, opacity: 0.6 });
  const edgesGeometry = new THREE.EdgesGeometry(wallGeometry);
  const groups = new Map<RoomId, THREE.Group>();
  const floors = new Map<RoomId, THREE.Mesh>();
  for (const id of roomIds) {
    const group = new THREE.Group(); group.position.x = (id - 2) * roomSpacing; scene.add(group); groups.set(id, group);
    const shell = new THREE.Mesh(wallGeometry, wallMaterial); shell.position.y = roomHeight / 2; group.add(shell);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.006; group.add(floor); floors.set(id, floor);
    const edges = new THREE.LineSegments(edgesGeometry, edgeMaterial); edges.position.y = roomHeight / 2; group.add(edges);
    const origin = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.1, 16), new THREE.MeshBasicMaterial({ color: 0xb7bfc7 }));
    origin.rotation.x = -Math.PI / 2; origin.position.y = 0.012; group.add(origin);
  }
  type DisplayItem = { id: ItemId; room: RoomId; mesh: THREE.Mesh; ring: THREE.Mesh; anchor: THREE.Object3D };
  const displayed: DisplayItem[] = [], pickTargets: THREE.Mesh[] = [];
  const materials: THREE.Material[] = [];
  for (const definition of roomItems) {
    const material = new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.35, metalness: 0.05 }); materials.push(material);
    for (const room of [0, definition.room] satisfies RoomId[]) {
      const group = groups.get(room); if (!group) throw new Error('部屋が見つかりません。');
      const mesh = new THREE.Mesh(geometry[definition.shape], material); mesh.position.y = heights[definition.shape]; group.add(mesh); pickTargets.push(mesh);
      const ring = new THREE.Mesh(ringGeometry, ringMaterial); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.018; group.add(ring);
      const anchor = new THREE.Object3D(); anchor.position.y = 0.55; mesh.add(anchor);
      displayed.push({ id: definition.id, room, mesh, ring, anchor });
    }
  }
  const links = roomItems.map(item => {
    const from = displayed.find(value => value.id === item.id && value.room === 0), to = displayed.find(value => value.id === item.id && value.room === item.room);
    if (!from || !to) throw new Error('リンク先が見つかりません。');
    const linkGeometry = new THREE.BufferGeometry(); linkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(41 * 3), 3));
    const material = new THREE.LineBasicMaterial({ color: item.color, transparent: true, opacity: 0.75 }); materials.push(material);
    const line = new THREE.Line(linkGeometry, material); scene.add(line);
    return { id: item.id, from, to, line };
  });
  const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const point = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  let width = 1, height = 1;
  function setRay(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    mouse.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(mouse, camera);
  }
  function pickItem(clientX: number, clientY: number): ItemId | null {
    setRay(clientX, clientY);
    const hit = raycaster.intersectObjects(pickTargets, false)[0];
    return displayed.find(item => item.mesh === hit?.object)?.id ?? null;
  }
  function pickRoom(clientX: number, clientY: number): RoomId | null {
    setRay(clientX, clientY);
    let nearest = Infinity, result: RoomId | null = null;
    const bounds = new THREE.Box3(new THREE.Vector3(-roomWidth / 2 - 0.4, -0.2, -roomDepth / 2 - 0.4), new THREE.Vector3(roomWidth / 2 + 0.4, roomHeight, roomDepth / 2 + 0.4));
    for (const [id, group] of groups) {
      const ray = raycaster.ray.clone().applyMatrix4(group.matrixWorld.clone().invert());
      const hit = ray.intersectBox(bounds, new THREE.Vector3());
      if (!hit) continue;
      group.localToWorld(hit); const distance = hit.distanceTo(raycaster.ray.origin);
      if (distance < nearest) { nearest = distance; result = id; }
    }
    return result;
  }
  function movement(dx: number, up: number): Point {
    const group = groups.get(0); if (!group) return { x: 0, z: 0 };
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), vertical = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion), z = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
    const rx = x.dot(right), rz = z.dot(right), ux = x.dot(vertical), uz = z.dot(vertical), determinant = rx * uz - rz * ux;
    const delta = new THREE.Vector2((dx * uz - rz * up) / determinant, (rx * up - ux * dx) / determinant).normalize();
    return { x: delta.x, z: delta.y };
  }
  function render(state: RoomsState, activeRoom: RoomId) {
    for (const [id, group] of groups) { const rotation = state.rotations[id]; group.rotation.set(rotation.pitch, rotation.yaw, 0, 'YXZ'); }
    for (const [id, floor] of floors) floor.material = id === activeRoom ? selectedFloor : floorMaterial;
    for (const item of displayed) {
      const position = state.positions[item.id];
      item.mesh.position.x = position.x; item.mesh.position.z = position.z;
      item.ring.position.set(position.x, 0.018, position.z); item.ring.visible = state.selected === item.id;
    }
    scene.updateMatrixWorld(true);
    for (const link of links) {
      link.line.visible = state.allLinks || state.selected === link.id;
      if (!link.line.visible) continue;
      link.from.anchor.getWorldPosition(a); link.to.anchor.getWorldPosition(b);
      const middle = a.clone().add(b).multiplyScalar(0.5); middle.y = 4 + Math.abs(a.x - b.x) * 0.14;
      const curve = new THREE.QuadraticBezierCurve3(a.clone(), middle, b.clone());
      const attribute = link.line.geometry.getAttribute('position');
      for (let i = 0; i <= 40; i++) { curve.getPoint(i / 40, point); attribute.setXYZ(i, point.x, point.y, point.z); }
      attribute.needsUpdate = true; link.line.geometry.computeBoundingSphere();
    }
    updateLabels(displayed.map(item => {
      item.mesh.getWorldPosition(point); point.y += 0.75; point.project(camera);
      return { key: `${item.room}:${item.id}`, id: item.id, room: item.room, x: (point.x * 0.5 + 0.5) * width, y: (-point.y * 0.5 + 0.5) * height, selected: state.selected === item.id };
    }));
    renderer.render(scene, camera);
  }
  function resize() {
    width = canvas.clientWidth; height = canvas.clientHeight;
    const halfWidth = 21, halfHeight = halfWidth * height / width;
    camera.left = -halfWidth; camera.right = halfWidth; camera.top = halfHeight + 0.7; camera.bottom = -halfHeight + 0.7;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
  }
  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>(), allMaterials = new Set<THREE.Material>(materials);
    scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) allMaterials.add(material);
      }
    });
    geometries.forEach(value => value.dispose()); allMaterials.forEach(value => value.dispose()); renderer.dispose();
  }
  return { render, resize, pickItem, pickRoom, movement, dispose };
}
