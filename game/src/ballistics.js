// Ballistics: the player's hitscan shots, grenade flight and blasts, and the
// planted charge. A shot is one ray against the world's meshes and every
// living bot's hit meshes; the first thing it meets decides the result.
// Grenades are small spheres with gravity that bounce off colliders once or
// twice before their fuse runs out.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { GRENADES } from './weapons.js';

const GRENADE_RADIUS = 0.09;
const GRAVITY = 14;

export function createBallistics(scene, world, effects) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const probe = new THREE.Box3();
  const grenades = [];
  const grenadeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2d33'), roughness: 0.5, metalness: 0.6 });
  const grenadeGeometry = new THREE.SphereGeometry(GRENADE_RADIUS, 10, 8);

  // The planted charge: a small device with a blinking light.
  const bombGroup = new THREE.Group();
  const bombBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#1d1f24'), roughness: 0.5, metalness: 0.5 }),
  );
  const bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  bombLight.position.set(0, 0.14, 0);
  bombGroup.add(bombBody, bombLight);
  bombGroup.visible = false;
  scene.add(bombGroup);
  let bombBeep = 0;

  function shoot(origin, direction, hitMeshes) {
    raycaster.set(origin, direction);
    raycaster.firstHitOnly = false;
    const targets = raycaster.intersectObjects(hitMeshes, false);
    const walls = raycaster.intersectObjects(world.shootables, false);
    const wallDist = walls.length > 0 ? walls[0].distance : Infinity;
    const hit = targets.length > 0 ? targets[0] : null;
    if (hit && hit.distance < wallDist) {
      return { kind: 'bot', bot: hit.object.userData.bot, part: hit.object.userData.part, point: hit.point, distance: hit.distance };
    }
    if (walls.length > 0) {
      return { kind: 'wall', point: walls[0].point, distance: walls[0].distance, normal: walls[0].face ? walls[0].face.normal : null };
    }
    return { kind: 'none', point: null, distance: Infinity };
  }

  function throwGrenade(type, origin, direction, random) {
    const mesh = new THREE.Mesh(grenadeGeometry, grenadeMaterial);
    mesh.position.copy(origin);
    scene.add(mesh);
    const velocity = direction.clone().multiplyScalar(13);
    velocity.y += 3.5;
    grenades.push({
      type, mesh, velocity, fuse: GRENADES[type].fuse, bounced: 0, lastBounce: 0, random,
    });
  }

  function explodeGrenade(grenade, ctx) {
    const point = grenade.mesh.position;
    if (grenade.type === 'frag') {
      effects.blast(point);
      ctx.onExplosion(point, GRENADES.frag.radius, GRENADES.frag.maxDamage);
    } else {
      effects.blast(point);
      ctx.onFlash(point, GRENADES.flash.radius);
    }
    scene.remove(grenade.mesh);
  }

  function stepGrenades(dt, time, ctx) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.velocity.y -= GRAVITY * dt;
      g.mesh.position.x += g.velocity.x * dt;
      g.mesh.position.y += g.velocity.y * dt;
      g.mesh.position.z += g.velocity.z * dt;
      const p = g.mesh.position;
      // Floor.
      if (p.y < GRENADE_RADIUS) {
        p.y = GRENADE_RADIUS;
        if (Math.abs(g.velocity.y) > 1 && time - g.lastBounce > 0.12) {
          g.velocity.y = -g.velocity.y * 0.45;
          g.velocity.x *= 0.7;
          g.velocity.z *= 0.7;
          g.lastBounce = time;
          ctx.onBounce();
        } else {
          g.velocity.y = 0;
        }
      }
      // Walls and cover: push out along the smallest penetration axis.
      probe.min.set(p.x - GRENADE_RADIUS, p.y - GRENADE_RADIUS, p.z - GRENADE_RADIUS);
      probe.max.set(p.x + GRENADE_RADIUS, p.y + GRENADE_RADIUS, p.z + GRENADE_RADIUS);
      for (const box of world.colliders) {
        if (!probe.intersectsBox(box)) continue;
        const dxMin = probe.max.x - box.min.x;
        const dxMax = box.max.x - probe.min.x;
        const dyMin = probe.max.y - box.min.y;
        const dyMax = box.max.y - probe.min.y;
        const dzMin = probe.max.z - box.min.z;
        const dzMax = box.max.z - probe.min.z;
        const minPen = Math.min(dxMin, dxMax, dyMin, dyMax, dzMin, dzMax);
        if (minPen === dxMin) { p.x = box.min.x - GRENADE_RADIUS; g.velocity.x = -Math.abs(g.velocity.x) * 0.45; }
        else if (minPen === dxMax) { p.x = box.max.x + GRENADE_RADIUS; g.velocity.x = Math.abs(g.velocity.x) * 0.45; }
        else if (minPen === dyMin) { p.y = box.min.y - GRENADE_RADIUS; g.velocity.y = -Math.abs(g.velocity.y) * 0.45; }
        else if (minPen === dyMax) { p.y = box.max.y + GRENADE_RADIUS; g.velocity.y = Math.abs(g.velocity.y) * 0.45; }
        else if (minPen === dzMin) { p.z = box.min.z - GRENADE_RADIUS; g.velocity.z = -Math.abs(g.velocity.z) * 0.45; }
        else { p.z = box.max.z + GRENADE_RADIUS; g.velocity.z = Math.abs(g.velocity.z) * 0.45; }
        if (time - g.lastBounce > 0.12) {
          g.lastBounce = time;
          ctx.onBounce();
        }
        break;
      }
      if (g.fuse <= 0) {
        explodeGrenade(g, ctx);
        grenades.splice(i, 1);
      }
    }
  }

  return {
    shoot,
    throwGrenade,
    step(dt, time, ctx) {
      stepGrenades(dt, time, ctx);
      // Bomb light blinks faster as the timer runs down.
      if (bombGroup.visible) {
        bombBeep += dt;
        const interval = 0.55;
        if (bombBeep >= interval) {
          bombBeep = 0;
          ctx.onBombBeep();
        }
        bombLight.material.color.setHex(Math.sin(time * 10) > 0 ? 0xe5484d : 0x5a1518);
      }
    },
    showBomb(x, z) {
      bombGroup.position.set(x, 0.12, z);
      bombGroup.visible = true;
    },
    hideBomb() {
      bombGroup.visible = false;
    },
    reset() {
      for (const g of grenades) scene.remove(g.mesh);
      grenades.length = 0;
      bombGroup.visible = false;
    },
  };
}
