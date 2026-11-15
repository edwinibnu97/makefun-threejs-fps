// Shared body physics: a capsule approximated as a box, resolved one axis at
// a time against the world's colliders, so a wall never swallows a body and
// standing on the floor is never read as walking into a wall. Both the player
// and the bots move through here; nothing here allocates per call.
import * as THREE from 'three';

const RADIUS = 0.34;

export function createBody(x, z, height) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    height,
    eye: 1.6,
    onGround: true,
  };
}

// Move a body by its velocity for dt, resolving against colliders. Returns
// true when the body is standing on something. `lift` keeps the feet and the
// crown out of the horizontal tests.
export function moveBody(body, colliders, dt, probe) {
  const height = body.height;
  const x0 = body.position.x;
  const z0 = body.position.z;

  const nextX = x0 + body.velocity.x * dt;
  if (!overlaps(probe, colliders, nextX, body.position.y, z0, height, 0.04)) {
    body.position.x = nextX;
  } else {
    body.velocity.x = 0;
  }
  const nextZ = z0 + body.velocity.z * dt;
  if (!overlaps(probe, colliders, body.position.x, body.position.y, nextZ, height, 0.04)) {
    body.position.z = nextZ;
  } else {
    body.velocity.z = 0;
  }

  body.position.y += body.velocity.y * dt;
  let grounded = false;
  const hit = overlaps(probe, colliders, body.position.x, body.position.y, body.position.z, height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    grounded = true;
  } else if (hit) {
    body.position.y = hit.min.y - height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    grounded = true;
  }
  body.onGround = grounded;
  return grounded;
}

function overlaps(probe, colliders, x, y, z, height, lift) {
  probe.min.set(x - RADIUS, y + lift, z - RADIUS);
  probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
  for (let i = 0; i < colliders.length; i += 1) {
    if (probe.intersectsBox(colliders[i])) return colliders[i];
  }
  return null;
}

// True when the straight segment from `from` to `to` meets no world mesh.
// Used for line of sight; the raycaster is reused and never allocates.
export function hasLineOfSight(from, to, meshes, raycaster) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 0.001) return true;
  raycaster.set(from, _losDir.set(dx / dist, dy / dist, dz / dist));
  raycaster.far = dist;
  raycaster.firstHitOnly = true;
  const hits = raycaster.intersectObjects(meshes, false);
  return hits.length === 0;
}

const _losDir = new THREE.Vector3();
