import { isRecord } from '../sandbox/protocol';

export type RoomId = 0 | 1 | 2 | 3 | 4;
export type SourceRoomId = Exclude<RoomId, 0>;
export type ItemId = '1-a' | '1-b' | '2-a' | '2-b' | '3-a' | '3-b' | '4-a' | '4-b';
export type Point = { x: number; z: number };
export type Rotation = { yaw: number; pitch: number };
export interface RoomItem { id: ItemId; room: SourceRoomId; name: string; shape: 'box' | 'sphere' | 'cone' | 'torus'; color: string }
export interface RoomsState {
  schema: 1;
  positions: Record<ItemId, Point>;
  rotations: Record<RoomId, Rotation>;
  selected: ItemId | null;
  allLinks: boolean;
}
export const roomIds: RoomId[] = [0, 1, 2, 3, 4];
export const roomWidth = 6;
export const roomDepth = 5;
export const roomHeight = 2.5;
export const roomSpacing = 8;
export const cameraElevation = 50 * Math.PI / 180;
export const pitchLimit = cameraElevation - 10 * Math.PI / 180;
export const roomItems: RoomItem[] = [
  { id: '1-a', room: 1, name: '箱', shape: 'box', color: '#d77d68' },
  { id: '1-b', room: 1, name: '球', shape: 'sphere', color: '#d77d68' },
  { id: '2-a', room: 2, name: '円すい', shape: 'cone', color: '#c59c40' },
  { id: '2-b', room: 2, name: '輪', shape: 'torus', color: '#c59c40' },
  { id: '3-a', room: 3, name: '球', shape: 'sphere', color: '#469e8d' },
  { id: '3-b', room: 3, name: '箱', shape: 'box', color: '#469e8d' },
  { id: '4-a', room: 4, name: '輪', shape: 'torus', color: '#8d80ba' },
  { id: '4-b', room: 4, name: '円すい', shape: 'cone', color: '#8d80ba' },
];
const initialPositions: Record<ItemId, Point> = {
  '1-a': { x: -2.1, z: -0.9 }, '1-b': { x: -0.7, z: -0.9 }, '2-a': { x: 0.7, z: -0.9 }, '2-b': { x: 2.1, z: -0.9 },
  '3-a': { x: -2.1, z: 0.9 }, '3-b': { x: -0.7, z: 0.9 }, '4-a': { x: 0.7, z: 0.9 }, '4-b': { x: 2.1, z: 0.9 },
};
export const roomsStorageKey = 'threejs-sandbox:rooms:v1';
export function initialRoomsState(): RoomsState {
  const rotation = () => ({ yaw: -20 * Math.PI / 180, pitch: 0 });
  return { schema: 1, positions: structuredClone(initialPositions), rotations: { 0: rotation(), 1: rotation(), 2: rotation(), 3: rotation(), 4: rotation() }, selected: null, allLinks: false };
}
export function constrainPosition(point: Point): Point {
  return { x: Math.max(-roomWidth / 2 + 0.6, Math.min(roomWidth / 2 - 0.6, point.x)), z: Math.max(-roomDepth / 2 + 0.6, Math.min(roomDepth / 2 - 0.6, point.z)) };
}
export function moveRoomItem(state: RoomsState, id: ItemId, delta: Point): RoomsState {
  const point = state.positions[id];
  return { ...state, positions: { ...state.positions, [id]: constrainPosition({ x: point.x + delta.x, z: point.z + delta.z }) } };
}
export function rotateRoom(state: RoomsState, room: RoomId, rotation: Rotation): RoomsState {
  return { ...state, rotations: { ...state.rotations, [room]: {
    yaw: Math.atan2(Math.sin(rotation.yaw), Math.cos(rotation.yaw)),
    pitch: Math.max(-pitchLimit, Math.min(pitchLimit, rotation.pitch)),
  } } };
}
export function parseRoomsState(value: unknown): RoomsState | undefined {
  if (!isRecord(value) || value.schema !== 1 || !isRecord(value.positions) || !isRecord(value.rotations) || typeof value.allLinks !== 'boolean') return;
  const state = initialRoomsState();
  for (const item of roomItems) {
    const point = value.positions[item.id];
    if (!isRecord(point) || typeof point.x !== 'number' || !Number.isFinite(point.x) || typeof point.z !== 'number' || !Number.isFinite(point.z)) return;
    state.positions[item.id] = constrainPosition({ x: point.x, z: point.z });
  }
  for (const id of roomIds) {
    const rotation = value.rotations[id];
    if (!isRecord(rotation) || typeof rotation.yaw !== 'number' || !Number.isFinite(rotation.yaw) || typeof rotation.pitch !== 'number' || !Number.isFinite(rotation.pitch)) return;
    state.rotations[id] = rotateRoom(state, id, { yaw: rotation.yaw, pitch: rotation.pitch }).rotations[id];
  }
  const selected = roomItems.find(item => item.id === value.selected);
  if (value.selected !== null && !selected) return;
  return { ...state, selected: selected?.id ?? null, allLinks: value.allLinks };
}
