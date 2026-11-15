// The player body: acceleration, friction, gravity, crouch and jump, moved
// through the shared physics resolver so a wall never swallows the player.
// Firing on the move is punished through `groundSpeed()`, which the weapon
// reads as spread.
import * as THREE from 'three';
import { createBody, moveBody } from './physics.js';

const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders, spawn) {
  const body = createBody(spawn.x, spawn.z, STAND_HEIGHT);
  body.yaw = spawn.yaw;
  body.pitch = 0;
  body.eye = STAND_EYE;
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();
  const state = {
    body,
    crouching: false,
    health: 100,
    armor: 0,
    alive: true,
    flash: 0,
  };

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys, sprint) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !state.crouching) {
      state.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!crouching && state.crouching) {
      body.height = STAND_HEIGHT;
      state.crouching = false;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = (state.crouching ? CROUCH_SPEED : WALK_SPEED) * (sprint && !state.crouching ? 1.25 : 1);
    const blend = Math.min(1, (body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;
    moveBody(body, colliders, dt, probe);
    body.velocity.y = Math.max(-30, body.velocity.y);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
  }

  function reset(spawnPoint) {
    body.position.set(spawnPoint.x, 0, spawnPoint.z);
    body.velocity.set(0, 0, 0);
    body.yaw = spawnPoint.yaw;
    body.pitch = 0;
    body.height = STAND_HEIGHT;
    body.eye = STAND_EYE;
    state.crouching = false;
    state.health = 100;
    state.armor = 0;
    state.alive = true;
    state.flash = 0;
  }

  return {
    state,
    step,
    look,
    recoil,
    reset,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
    eyePosition(out) {
      out.set(body.position.x, body.position.y + body.eye, body.position.z);
      return out;
    },
  };
}
