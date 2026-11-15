// The bots: five of them, two Ember friends and three Slate enemies. Each one
// is a small state machine — hold a position, walk a route, engage what it
// sees, plant or defuse the charge — driven by line of sight, hearing and a
// nav-graph route. They aim with a reaction delay and an error that shrinks
// the longer they have the target in sight, so a player who stops, aims and
// fires first wins the duel.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createBody, moveBody, hasLineOfSight } from './physics.js';
import { WEAPONS } from './weapons.js';

const BOT_SPEED = 4.2;
const BOT_AIM_SPEED = 2.3;
const BOT_HEIGHT = 1.72;
const BOT_EYE = 1.6;
const HEALTH = 100;
const SENSE_INTERVAL = 0.12;
const SEE_RANGE = 46;
const SEE_FOV = 1.9;
const HEAR_RANGE = 26;

const EMBER_NAMES = ['Vex', 'Rowan'];
const SLATE_NAMES = ['Bram', 'Ilya', 'Sable'];

const _eye = new THREE.Vector3();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();
const _losRay = new THREE.Raycaster();

function buildBotMesh(scene, team) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#26282e'), roughness: 0.85, metalness: 0.1 });
  const vest = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'ember' ? PALETTE.accent : PALETTE.slate),
    roughness: 0.6, metalness: 0.15,
  });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a37e'), roughness: 0.7 });
  const helmet = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a3e46'), roughness: 0.6, metalness: 0.4 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.18), dark);
  legL.position.set(-0.11, 0.26, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), dark);
  torso.position.y = 0.95;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.4, 0.34), vest);
  plate.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), skin);
  head.position.y = 1.52;
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.28), helmet);
  helm.position.y = 1.66;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.5, 0.11), dark);
  armL.position.set(-0.3, 1.05, 0.12);
  armL.rotation.x = -0.9;
  const armR = armL.clone();
  armR.position.x = 0.3;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), helmet);
  gun.position.set(0.12, 1.18, -0.2);
  group.add(legL, legR, torso, plate, head, helm, armL, armR, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  scene.add(group);
  return {
    group, legL, legR, gun, head, torso, legLMesh: legL, legRMesh: legR,
    headMesh: head, torsoMesh: torso,
  };
}

export function createBots(scene, world) {
  const list = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const probe = new THREE.Box3();

  function makeBot(name, team) {
    const parts = buildBotMesh(scene, team);
    const bot = {
      name,
      team,
      body: createBody(0, 0, BOT_HEIGHT),
      health: HEALTH,
      alive: true,
      state: 'hold',
      holdNode: 0,
      holdUntil: 0,
      route: [],
      routeIndex: 0,
      target: null,
      targetKind: null,
      lastSeen: -10,
      lastKnown: new THREE.Vector3(),
      aimTime: 0,
      reactionAt: 0,
      burstLeft: 0,
      burstTimer: 0,
      pauseTimer: 0,
      senseTimer: Math.random() * SENSE_INTERVAL,
      stuckTimer: 0,
      lastX: 0,
      lastZ: 0,
      strafeTimer: 0,
      strafeDir: 1,
      channel: null,
      flash: 0,
      isCarrier: false,
      site: null,
      walkPhase: 0,
      fall: 0,
      parts,
      eye: new THREE.Vector3(),
    };
    bot.body.eye = BOT_EYE;
    parts.headMesh.userData = { bot, part: 'head' };
    parts.torsoMesh.userData = { bot, part: 'torso' };
    parts.legLMesh.userData = { bot, part: 'legs' };
    parts.legRMesh.userData = { bot, part: 'legs' };
    hitMeshes.push(parts.headMesh, parts.torsoMesh, parts.legLMesh, parts.legRMesh);
    list.push(bot);
    return bot;
  }

  for (const name of EMBER_NAMES) makeBot(name, 'ember');
  for (const name of SLATE_NAMES) makeBot(name, 'slate');

  function eyeOf(bot, out) {
    out.set(bot.body.position.x, bot.body.position.y + BOT_EYE, bot.body.position.z);
    return out;
  }

  function chestOf(entity, out) {
    // entity is the player state or a bot; both carry a physics body.
    out.set(entity.body.position.x, entity.body.position.y + 1.1, entity.body.position.z);
    return out;
  }

  function canSee(bot, entity, time) {
    eyeOf(bot, _eye);
    chestOf(entity, _target);
    _dir.subVectors(_target, _eye);
    const dist = _dir.length();
    if (dist > SEE_RANGE) return false;
    if (dist > 9) {
      // Field of view check, skipped at close range (hearing covers it).
      _fwd.copy(_dir).normalize();
      const facingX = -Math.sin(bot.body.yaw);
      const facingZ = -Math.cos(bot.body.yaw);
      if (_fwd.x * facingX + _fwd.z * facingZ < Math.cos(SEE_FOV / 2) * 0.9) return false;
    }
    return hasLineOfSight(_eye, _target, world.shootables, _losRay);
  }

  function pickTarget(bot, player, time) {
    let best = null;
    let bestKind = null;
    let bestDist = Infinity;
    const consider = (entity, kind) => {
      if (!entity.alive) return;
      eyeOf(bot, _eye);
      chestOf(entity, _target);
      const dist = _eye.distanceTo(_target);
      if (dist < bestDist && canSee(bot, entity, time)) {
        best = entity;
        bestKind = kind;
        bestDist = dist;
      }
    };
    if (bot.team === 'ember') {
      for (const other of list) if (other.team === 'slate') consider(other, 'bot');
    } else {
      if (player.alive) consider(player, 'player');
      for (const other of list) if (other.team === 'ember') consider(other, 'bot');
    }
    return { target: best, kind: bestKind, dist: bestDist };
  }

  function setRoute(bot, toNode) {
    const fromNode = world.nearestNode(bot.body.position.x, bot.body.position.z);
    bot.route = world.findRoute(fromNode, toNode);
    bot.routeIndex = 0;
    bot.state = 'move';
  }

  function stepBot(bot, dt, time, ctx) {
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.parts.group.rotation.x = -bot.fall * 1.5;
        bot.parts.group.position.y = -bot.fall * 0.15;
      }
      return;
    }
    if (bot.flash > 0) bot.flash = Math.max(0, bot.flash - dt);

    // --- sensing, staggered per bot ---
    bot.senseTimer -= dt;
    if (bot.senseTimer <= 0) {
      bot.senseTimer = SENSE_INTERVAL;
      const found = pickTarget(bot, ctx.player, time);
      if (found.target) {
        if (bot.target !== found.target) {
          bot.reactionAt = time + 0.45 + Math.random() * 0.35;
          bot.aimTime = 0;
        }
        bot.target = found.target;
        bot.targetKind = found.kind;
        bot.lastSeen = time;
        chestOf(found.target, bot.lastKnown);
      } else if (bot.target && time - bot.lastSeen > 1.2) {
        bot.target = null;
        bot.targetKind = null;
      }
    }

    // --- hearing: gunfire pulls defenders toward the noise ---
    if (bot.team === 'slate' && ctx.noise) {
      for (const event of ctx.noise) {
        if (event.team === 'ember') {
          const dx = event.x - bot.body.position.x;
          const dz = event.z - bot.body.position.z;
          if (dx * dx + dz * dz < HEAR_RANGE * HEAR_RANGE && bot.state !== 'defuse') {
            const node = world.nearestNode(event.x, event.z);
            if (bot.state === 'hold' || bot.holdNode !== node) setRoute(bot, node);
          }
        }
      }
    }

    // --- channel: plant or defuse ---
    if (bot.channel) {
      const ch = bot.channel;
      ch.progress += dt;
      if (ch.progress >= ch.duration) {
        const done = ch;
        bot.channel = null;
        ctx.onChannelDone(bot, done.type);
      }
      bot.body.velocity.set(0, 0, 0);
      moveBody(bot.body, world.colliders, dt, probe);
      return;
    }

    // --- combat: face the target and fire in bursts ---
    let wantMove = null;
    let moveSpeed = BOT_SPEED;
    if (bot.target && bot.flash <= 0) {
      eyeOf(bot, _eye);
      chestOf(bot.target, _target);
      const dx = _target.x - _eye.x;
      const dz = _target.z - _eye.z;
      const desiredYaw = Math.atan2(-dx, -dz);
      let dyaw = desiredYaw - bot.body.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      bot.body.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, dyaw));
      bot.aimTime += dt;

      if (time >= bot.reactionAt) {
        bot.burstTimer -= dt;
        if (bot.burstLeft > 0 && bot.burstTimer <= 0) {
          bot.burstLeft -= 1;
          bot.burstTimer = 0.11;
          ctx.onBotShoot(bot, bot.target, bot.targetKind);
        } else if (bot.burstLeft <= 0) {
          bot.pauseTimer -= dt;
          if (bot.pauseTimer <= 0) {
            bot.burstLeft = 3 + Math.floor(Math.random() * 3);
            bot.pauseTimer = 0.5 + Math.random() * 0.5;
          }
        }
      }
      // Strafe a little while fighting so the duel moves.
      if (bot.strafeTimer > 0) {
        bot.strafeTimer -= dt;
        wantMove = { x: Math.cos(bot.body.yaw) * bot.strafeDir, z: -Math.sin(bot.body.yaw) * bot.strafeDir };
        moveSpeed = BOT_AIM_SPEED;
      } else if (Math.random() < dt * 0.4) {
        bot.strafeTimer = 0.5 + Math.random() * 0.6;
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
    }

    // --- orders: what to do when nobody is in sight ---
    if (!bot.target) {
      const bomb = ctx.bomb;
      if (bomb.state === 'planted') {
        if (bot.team === 'slate') {
          // Converge on the planted charge; the closest one defuses.
          const dx = bomb.x - bot.body.position.x;
          const dz = bomb.z - bot.body.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 1.6) {
            bot.channel = { type: 'defuse', progress: 0, duration: 5 };
            bot.state = 'defuse';
          } else if (bot.state !== 'move' || bot.route.length === 0) {
            setRoute(bot, world.nearestNode(bomb.x, bomb.z));
          }
        } else if (bot.state !== 'hold') {
          // Attackers hold a ring around the planted charge.
          const node = world.nearestNode(bomb.x + 3, bomb.z + 3);
          if (bot.holdNode !== node) {
            bot.holdNode = node;
            setRoute(bot, node);
          }
        }
      } else if (bot.team === 'ember') {
        if (bot.isCarrier) {
          // Carry the charge to the nearer site and plant it.
          const site = bot.site;
          const dx = site.x - bot.body.position.x;
          const dz = site.z - bot.body.position.z;
          if (Math.hypot(dx, dz) < 2.2) {
            bot.channel = { type: 'plant', progress: 0, duration: 3 };
            bot.state = 'plant';
          } else if (bot.state !== 'move' || bot.route.length === 0) {
            setRoute(bot, world.nearestNode(site.x, site.z));
          }
        } else if (!ctx.player.alive) {
          // The player is down: push the nearer site as a pack.
          const site = bot.site;
          if (bot.state !== 'move' || bot.route.length === 0) {
            setRoute(bot, world.nearestNode(site.x, site.z));
          }
        } else {
          // Follow the player at a few metres, staying out of their line.
          const px = ctx.player.body.position.x;
          const pz = ctx.player.body.position.z;
          const dx = px - bot.body.position.x;
          const dz = pz - bot.body.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 7) {
            const node = world.nearestNode(px, pz);
            if (bot.state !== 'move' || bot.route.length === 0) setRoute(bot, node);
          } else if (dist < 3) {
            wantMove = { x: -dx / dist, z: -dz / dist };
            moveSpeed = BOT_AIM_SPEED;
          } else {
            bot.body.velocity.x *= Math.max(0, 1 - 8 * dt);
            bot.body.velocity.z *= Math.max(0, 1 - 8 * dt);
          }
        }
      } else if (bot.team === 'slate') {
        // Defenders hold their post and rotate to a fresh one now and then.
        if (time > bot.holdUntil) {
          bot.holdUntil = time + 12 + Math.random() * 10;
          const options = bot.site === 'A' ? [14, 15, 12] : bot.site === 'B' ? [16, 17, 13] : [11, 23, 6];
          const node = options[Math.floor(Math.random() * options.length)];
          bot.holdNode = node;
          setRoute(bot, node);
        }
      }
    }

    // --- movement along the route ---
    if (bot.state === 'move' && bot.route.length > 0) {
      if (bot.routeIndex >= bot.route.length) {
        bot.state = 'hold';
        bot.route = [];
      } else {
        const node = bot.route[bot.routeIndex];
        world.nodePosition(node, _to);
        const dx = _to.x - bot.body.position.x;
        const dz = _to.z - bot.body.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.6) {
          bot.routeIndex += 1;
        } else {
          wantMove = { x: dx / dist, z: dz / dist };
          if (!bot.target) {
            const desiredYaw = Math.atan2(-dx, -dz);
            let dyaw = desiredYaw - bot.body.yaw;
            while (dyaw > Math.PI) dyaw -= Math.PI * 2;
            while (dyaw < -Math.PI) dyaw += Math.PI * 2;
            bot.body.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, dyaw));
          }
        }
      }
    }

    if (wantMove) {
      bot.body.velocity.x += (wantMove.x * moveSpeed - bot.body.velocity.x) * Math.min(1, 10 * dt);
      bot.body.velocity.z += (wantMove.z * moveSpeed - bot.body.velocity.z) * Math.min(1, 10 * dt);
    } else if (!bot.target) {
      bot.body.velocity.x *= Math.max(0, 1 - 8 * dt);
      bot.body.velocity.z *= Math.max(0, 1 - 8 * dt);
    }
    bot.body.velocity.y -= 20 * dt;
    moveBody(bot.body, world.colliders, dt, probe);

    // Stuck detection: barely moved while trying — sidestep, then skip ahead.
    const moved = Math.hypot(bot.body.position.x - bot.lastX, bot.body.position.z - bot.lastZ);
    if (wantMove && moved < 0.05) {
      bot.stuckTimer += dt;
      if (bot.stuckTimer > 1.2) {
        bot.stuckTimer = 0;
        if (bot.route.length > 0 && bot.routeIndex < bot.route.length - 1) {
          bot.routeIndex += 1;
        } else {
          bot.state = 'hold';
          bot.route = [];
        }
      }
    } else {
      bot.stuckTimer = 0;
    }
    bot.lastX = bot.body.position.x;
    bot.lastZ = bot.body.position.z;

    // Walk cycle: legs swing, body bobs, gun follows the yaw.
    const speed = Math.hypot(bot.body.velocity.x, bot.body.velocity.z);
    bot.walkPhase += dt * speed * 2.2;
    const swing = Math.min(0.5, speed / BOT_SPEED) * 0.45 * Math.sin(bot.walkPhase);
    bot.parts.legL.rotation.x = swing;
    bot.parts.legR.rotation.x = -swing;
    bot.parts.group.position.set(bot.body.position.x, bot.body.position.y + Math.abs(Math.sin(bot.walkPhase)) * 0.03, bot.body.position.z);
    bot.parts.group.rotation.y = bot.body.yaw;
  }

  function spawnRound(random, sitePick) {
    // Ember: two friends at the south spawn. Slate: two on the sites, one mid.
    const emberSpawns = [{ x: -3, z: 17 }, { x: 3, z: 17 }];
    const slateSpawns = [{ x: -14, z: -13 }, { x: 14, z: -13 }, { x: 0, z: -8 }];
    let ei = 0;
    let si = 0;
    for (const bot of list) {
      bot.health = HEALTH;
      bot.alive = true;
      bot.target = null;
      bot.targetKind = null;
      bot.channel = null;
      bot.flash = 0;
      bot.isCarrier = false;
      bot.fall = 0;
      bot.route = [];
      bot.routeIndex = 0;
      bot.stuckTimer = 0;
      bot.aimTime = 0;
      bot.burstLeft = 0;
      bot.parts.group.rotation.set(0, 0, 0);
      bot.parts.group.position.y = 0;
      if (bot.team === 'ember') {
        const spawn = emberSpawns[ei];
        ei += 1;
        bot.body.position.set(spawn.x, 0, spawn.z);
        bot.body.velocity.set(0, 0, 0);
        bot.body.yaw = 0;
        bot.body.pitch = 0;
        bot.site = sitePick;
        bot.state = 'hold';
        bot.holdNode = 0;
        bot.holdUntil = 0;
      } else {
        const spawn = slateSpawns[si];
        si += 1;
        bot.body.position.set(spawn.x, 0, spawn.z);
        bot.body.velocity.set(0, 0, 0);
        bot.body.yaw = Math.PI;
        bot.body.pitch = 0;
        bot.site = si === 1 ? 'A' : si === 2 ? 'B' : null;
        bot.state = 'hold';
        bot.holdNode = world.nearestNode(spawn.x, spawn.z);
        bot.holdUntil = 0;
      }
      bot.lastX = bot.body.position.x;
      bot.lastZ = bot.body.position.z;
      bot.parts.group.position.set(bot.body.position.x, 0, bot.body.position.z);
      bot.parts.group.rotation.y = bot.body.yaw;
    }
  }

  function damage(bot, amount, part, attackerName) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.channel) bot.channel = null;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.state = 'dead';
      bot.fall = 0;
      return true;
    }
    return false;
  }

  return {
    list,
    hitMeshes,
    spawnRound,
    damage,
    step(dt, time, ctx) {
      for (const bot of list) stepBot(bot, dt, time, ctx);
    },
    aliveCount(team) {
      let count = 0;
      for (const bot of list) if (bot.team === team && bot.alive) count += 1;
      return count;
    },
    carrier() {
      for (const bot of list) if (bot.isCarrier && bot.alive) return bot;
      return null;
    },
    reset() {
      for (const bot of list) {
        bot.parts.group.visible = true;
        bot.parts.group.rotation.set(0, 0, 0);
      }
    },
  };
}
