import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cameraElevation, initialRoomsState, moveRoomItem, parseRoomsState, pitchLimit, roomIds, roomItems, rotateRoom } from '../src/rooms/model';

const original = initialRoomsState(), definitions = JSON.stringify(roomItems);
let moved = original;
for (const item of roomItems) {
  moved = moveRoomItem(moved, item.id, { x: 100, z: -100 });
  assert.deepEqual(moved.positions[item.id], { x: 2.4, z: -1.9 });
  assert.notDeepEqual(original.positions[item.id], moved.positions[item.id]);
}
assert.equal(JSON.stringify(roomItems), definitions);
assert.deepEqual(parseRoomsState(JSON.parse(JSON.stringify(moved))), moved);
assert.equal(parseRoomsState({ ...original, selected: 'missing' }), undefined);
assert.equal(parseRoomsState({ ...original, positions: { ...original.positions, '1-a': { x: NaN, z: 0 } } }), undefined);
assert.equal(parseRoomsState({ ...original, rotations: null }), undefined);
const cameraDirection = new THREE.Vector3(0, 40 * Math.sin(cameraElevation) - 0.8, 40 * Math.cos(cameraElevation)).normalize();
for (const room of roomIds) for (let yaw = -Math.PI; yaw <= Math.PI; yaw += 0.1) for (const pitch of [-100, -pitchLimit, 0, pitchLimit, 100]) {
  const rotated = rotateRoom(original, room, { yaw, pitch });
  assert(Math.abs(rotated.rotations[room].pitch) <= pitchLimit);
  const rotation = rotated.rotations[room];
  const floorNormal = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(rotation.pitch, rotation.yaw, 0, 'YXZ'));
  assert(floorNormal.dot(cameraDirection) > 0.15, 'The fixed camera stays above every room floor at every allowed yaw and pitch');
}
assert.deepEqual(original, initialRoomsState());
console.log('Rooms checks passed: 8 shared item positions, floor bounds, immutable edits, stored-state validation, and all 5 rooms above the floor through full yaw and clamped tilt.');
