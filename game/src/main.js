// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. main.js owns the orchestration — input into the player,
// shots into ballistics, bot callbacks into damage and the kill feed, the
// round state into the HUD — and nothing else. The simulation modules own
// their own state.
// ?shot=start|play|plant|end with &seed=N stages a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponSet, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createBallistics } from './ballistics.js';
import { createEffects } from './effects.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = shot ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1c2027');
scene.fog = new THREE.Fog(new THREE.Color('#1c2027'), 26, 78);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const ballistics = createBallistics(scene, world, effects);
const weaponSet = createWeaponSet(camera);
const player = createPlayer(world.colliders, SPAWNS.ember[0]);
const bots = createBots(scene, world);
const rounds = createRounds();
const audio = createAudio();
const hud = createHud({
  onBuyWeapon: (id) => buyWeapon(id),
  onBuyGrenade: (type) => buyGrenade(type),
  onBuyArmor: () => buyArmor(),
});
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const shootables = world.shootables.concat(bots.hitMeshes);

// Reused temporaries: the hot loop never allocates.
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _point = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();

const state = {
  started: false,
  spectating: null,
  noise: [],
  channel: null,
  sitePick: 'A',
  elapsed: 0,
  accumulator: 0,
  lastTime: performance.now(),
  frozen: false,
  deployAnnounced: false,
};

function siteByLabel(label) {
  return SITES[label];
}

function siteTargetLabel() {
  return `Target Site ${state.sitePick}`;
}

// ---------- damage ----------

function applyDamageToPlayer(amount, attackerName, head) {
  const ps = player.state;
  if (!ps.alive) return;
  const absorbed = Math.min(ps.armor, amount * 0.5);
  ps.armor -= absorbed;
  ps.health -= (amount - absorbed);
  hud.damageFlash(0.35 + (amount / 100) * 0.5);
  audio.hurt();
  if (ps.health <= 0) {
    ps.health = 0;
    ps.alive = false;
    rounds.onDeath();
    hud.killfeed(attackerName, 'You', head, 'slate');
    hud.showOverlay('dead');
    input.exitLock();
    // The charge passes to the nearest living Ember bot.
    const carrier = nearestLivingEmber();
    if (carrier) {
      carrier.isCarrier = true;
      carrier.site = siteByLabel(state.sitePick);
    }
    state.spectating = carrier;
  }
  syncHud();
}

function applyDamageToBot(bot, amount, part, attackerName, head) {
  const killed = bots.damage(bot, amount, part, attackerName);
  if (killed) {
    hud.killfeed(attackerName, bot.name, head, attackerName === 'You' ? 'ember' : 'slate');
    if (attackerName === 'You') {
      rounds.onKill();
      audio.kill();
    }
    if (bot.isCarrier) {
      bot.isCarrier = false;
      const next = nearestLivingEmber();
      if (next) {
        next.isCarrier = true;
        next.site = siteByLabel(state.sitePick);
      }
    }
  }
  return killed;
}

function nearestLivingEmber() {
  let best = null;
  let bestDist = Infinity;
  for (const bot of bots.list) {
    if (bot.team !== 'ember' || !bot.alive) continue;
    const dx = bot.body.position.x - player.state.body.position.x;
    const dz = bot.body.position.z - player.state.body.position.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = bot;
    }
  }
  return best;
}

// ---------- shooting ----------

function playerShoot() {
  const def = weaponSet.def();
  if (!weaponSet.takeRound()) {
    audio.dryFire();
    return;
  }
  player.eyePosition(_origin);
  camera.getWorldDirection(_dir);
  const spread = weaponSet.spread(player.groundSpeed());
  _dir.x += (random() * 2 - 1) * spread;
  _dir.y += (random() * 2 - 1) * spread;
  _dir.z += (random() * 2 - 1) * spread;
  _dir.normalize();
  weaponSet.muzzleWorld(_muzzle);
  const pellets = def.pellets;
  let anyHit = false;
  let anyKill = false;
  for (let p = 0; p < pellets; p += 1) {
    const result = ballistics.shoot(_origin, _dir, shootables);
    const end = result.point ? result.point : _to.copy(_origin).addScaledVector(_dir, 80);
    effects.tracer(_muzzle, end);
    if (result.kind === 'bot') {
      const part = result.part;
      const mult = part === 'head' ? def.headMult : part === 'legs' ? 0.8 : 1;
      const amount = Math.round(def.damage * mult);
      const killed = applyDamageToBot(result.bot, amount, part, 'You', part === 'head');
      anyHit = true;
      if (killed) anyKill = true;
      audio.hit(part === 'head');
      hud.hitMarker(killed, shot ? 4000 : 90);
    } else if (result.kind === 'wall') {
      effects.sparksAt(result.point, 6, 3, random);
    }
  }
  weaponSet.pullTrigger();
  player.recoil(0.009 + def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot(def.kind);
  state.noise.push({ x: player.state.body.position.x, z: player.state.body.position.z, team: 'ember' });
  syncHud();
}

function botShoot(bot, target, targetKind) {
  // A probability roll, not a ray: the bot's error grows with distance and
  // with how fast the target and the bot are moving, and shrinks the longer
  // the bot has held the target in sight.
  const eye = bot.eye;
  eye.set(bot.body.position.x, bot.body.position.y + 1.6, bot.body.position.z);
  const targetPos = targetKind === 'player'
    ? _to.set(target.body.position.x, target.body.position.y + 1.1, target.body.position.z)
    : _to.set(target.body.position.x, target.body.position.y + 1.1, target.body.position.z);
  const dist = eye.distanceTo(targetPos);
  const targetSpeed = targetKind === 'player'
    ? Math.hypot(target.body.velocity.x, target.body.velocity.z)
    : Math.hypot(target.body.velocity.x, target.body.velocity.z);
  const botSpeed = Math.hypot(bot.body.velocity.x, bot.body.velocity.z);
  const chance = Math.max(0.12, Math.min(0.85, 0.8 - dist * 0.009 - targetSpeed * 0.03 - botSpeed * 0.04 + bot.aimTime * 0.08));
  const muzzle = _muzzle.set(bot.body.position.x, bot.body.position.y + 1.35, bot.body.position.z);
  const hit = random() < chance;
  if (hit) {
    const head = random() < (targetSpeed < 1 && bot.aimTime > 1 ? 0.2 : 0.1);
    const amount = head ? 52 : 26;
    effects.tracer(muzzle, targetPos);
    if (targetKind === 'player') {
      applyDamageToPlayer(amount, bot.name, head);
    } else {
      const killed = applyDamageToBot(target, amount, head ? 'head' : 'torso', bot.name, head);
      if (killed) audio.kill();
    }
  } else {
    _point.copy(targetPos);
    _point.x += (random() * 2 - 1) * 1.6;
    _point.y += (random() * 2 - 1) * 1.2;
    _point.z += (random() * 2 - 1) * 1.6;
    effects.tracer(muzzle, _point);
  }
  audio.distantShot();
  state.noise.push({ x: bot.body.position.x, z: bot.body.position.z, team: bot.team });
}

// ---------- grenades, explosion, flash ----------

function throwGrenade(type) {
  const count = type === 'frag' ? weaponSet.state.frag : weaponSet.state.flashCount;
  if (count <= 0) {
    audio.deny();
    return;
  }
  player.eyePosition(_origin);
  camera.getWorldDirection(_dir);
  ballistics.throwGrenade(type, _origin, _dir, random);
  if (type === 'frag') weaponSet.state.frag -= 1;
  else weaponSet.state.flashCount -= 1;
  audio.buy();
  syncHud();
}

function onExplosion(point, radius, maxDamage) {
  audio.explosion();
  state.noise.push({ x: point.x, z: point.z, team: 'ember', big: true });
  const hurt = (entity, isPlayer) => {
    if (!entity.alive && !isPlayer) return;
    if (isPlayer && !player.state.alive) return;
    const pos = entity.body.position;
    const dist = Math.hypot(pos.x - point.x, pos.z - point.z);
    if (dist > radius) return;
    const amount = Math.max(10, Math.round(maxDamage * (1 - dist / radius)));
    if (isPlayer) applyDamageToPlayer(amount, 'Frag', false);
    else applyDamageToBot(entity, amount, 'torso', 'You', false);
  };
  hurt(player.state, true);
  for (const bot of bots.list) hurt(bot, false);
}

function onFlash(point, radius) {
  audio.flash();
  const blind = (entity, isPlayer) => {
    if (isPlayer && !player.state.alive) return;
    if (!isPlayer && !entity.alive) return;
    const pos = entity.body.position;
    const dx = point.x - pos.x;
    const dy = point.y - (pos.y + 1.5);
    const dz = point.z - pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > radius) return;
    // Facing the burst blinds fully; turned away, half.
    const yaw = isPlayer ? player.state.body.yaw : entity.body.yaw;
    const facing = (-Math.sin(yaw) * dx + -Math.cos(yaw) * dz) / Math.max(0.001, dist);
    const factor = facing > 0 ? 1 : 0.45;
    const duration = Math.max(0.8, Math.min(2.8, (2.8 - dist * 0.08) * factor));
    if (isPlayer) {
      player.state.flash = duration;
      hud.flashBlind(0.9);
    } else {
      entity.flash = duration;
    }
  };
  blind(player.state, true);
  for (const bot of bots.list) blind(bot, false);
}

// ---------- bomb channels ----------

function playerInSite(site) {
  const pos = player.state.body.position;
  const dx = pos.x - site.x;
  const dz = pos.z - site.z;
  return Math.hypot(dx, dz) < site.radius;
}

function stepChannel(dt) {
  const ps = player.state;
  const bomb = rounds.state.bomb;
  if (!ps.alive || state.channel) return;
  // Planting: the player carries the charge and stands in a site.
  if (bomb.state === 'carried' && !bots.carrier() && input.state.keys.has('KeyE')) {
    const site = playerInSite(SITES.A) ? SITES.A : playerInSite(SITES.B) ? SITES.B : null;
    if (site) {
      state.channel = { type: 'plant', progress: 0, duration: 3, site };
    }
  }
}

function updateChannel(dt) {
  if (!state.channel) {
    hud.setChannel('', null);
    return;
  }
  const ch = state.channel;
  const ps = player.state;
  const site = ch.site;
  const stillThere = ps.alive && playerInSite(site) && input.state.keys.has('KeyE');
  if (!stillThere) {
    state.channel = null;
    hud.setChannel('', null);
    return;
  }
  ch.progress += dt;
  hud.setChannel(ch.type === 'plant' ? 'Planting charge…' : 'Defusing…', ch.progress / ch.duration);
  if (ch.progress >= ch.duration) {
    state.channel = null;
    hud.setChannel('', null);
    rounds.plant(site, site.x, site.z);
    ballistics.showBomb(site.x, site.z);
    audio.plant();
    hud.banner('CHARGE PLANTED', `Site ${site.label} — defend it for ${rounds.state.bomb.timer | 0} seconds`, 3000);
  }
}

function onChannelDone(bot, type) {
  if (type === 'plant') {
    const site = bot.site;
    rounds.plant(site, site.x, site.z);
    ballistics.showBomb(site.x, site.z);
    audio.plant();
    hud.banner('CHARGE PLANTED', `Site ${site.label} — Slate must defuse`, 3000);
  } else {
    rounds.defuse();
    ballistics.hideBomb();
    audio.defuse();
    endRound('slate', 'Charge defused');
  }
}

// ---------- buying ----------

function buyWeapon(id) {
  if (rounds.state.phase !== 'buy') return;
  if (!rounds.buyWeapon(id)) {
    audio.deny();
    return;
  }
  weaponSet.buy(id);
  weaponSet.equip(id);
  audio.buy();
  refreshBuy();
  syncHud();
}

function buyGrenade(type) {
  if (rounds.state.phase !== 'buy') return;
  if (!rounds.buyGrenade(type)) {
    audio.deny();
    return;
  }
  if (type === 'frag') weaponSet.state.frag += 1;
  else weaponSet.state.flashCount += 1;
  audio.buy();
  refreshBuy();
  syncHud();
}

function buyArmor() {
  if (rounds.state.phase !== 'buy') return;
  if (!rounds.buyArmor()) {
    audio.deny();
    return;
  }
  player.state.armor = rounds.armorValue();
  audio.buy();
  refreshBuy();
  syncHud();
}

function refreshBuy() {
  hud.refreshBuy(
    rounds.state.money,
    weaponSet.owned,
    weaponSet.state.frag,
    weaponSet.state.flashCount,
    player.state.armor > 0,
  );
}

function openBuy() {
  hud.showBuy(
    rounds.state.money,
    weaponSet.owned,
    weaponSet.state.frag,
    weaponSet.state.flashCount,
    player.state.armor > 0,
  );
}

function deploy() {
  if (rounds.state.phase !== 'buy') return;
  rounds.deploy();
  hud.hideBuy();
  hud.banner(`ROUND ${rounds.state.round}`, `Plant the charge at Site ${state.sitePick}`, 2600);
  input.requestLock();
}

// ---------- rounds ----------

function respawnAll() {
  const armor = player.state.armor;
  player.reset(SPAWNS.ember[0]);
  player.state.armor = armor;
  weaponSet.refillAmmo();
  bots.spawnRound(random, state.sitePick);
  ballistics.reset();
  effects.reset();
  state.channel = null;
  state.spectating = null;
  state.noise = [];
}

function startMatch() {
  state.sitePick = 'A';
  rounds.startMatch();
  weaponSet.resetToPistol();
  respawnAll();
  state.started = true;
  state.deployAnnounced = false;
  openBuy();
}

function nextRound() {
  state.sitePick = rounds.state.round % 2 === 0 ? 'B' : 'A';
  rounds.nextRound();
  respawnAll();
  openBuy();
  hud.hideOverlay();
}

function endRound(winner, reason) {
  if (rounds.state.phase !== 'live') return;
  rounds.awardRound(winner, reason);
  ballistics.hideBomb();
  input.exitLock();
  const won = winner === 'ember';
  if (won) audio.roundWin();
  else audio.roundLose();
  const score = `Ember ${rounds.state.scoreEmber} — ${rounds.state.scoreSlate} Slate`;
  if (rounds.state.phase === 'matchEnd') {
    const matchWon = rounds.state.scoreEmber > rounds.state.scoreSlate;
    hud.banner(matchWon ? 'MATCH WON' : 'MATCH LOST', score, 4000);
    hud.showOverlay('matchEnd', `${score}. ${matchWon ? 'Ember takes Ashworks Yard.' : 'Slate holds Ashworks Yard.'}`);
  } else {
    hud.banner(won ? 'ROUND WON' : 'ROUND LOST', `${reason} · ${score}`, 3200);
    hud.showOverlay('roundEnd', `${won ? 'Round won' : 'Round lost'} — ${reason}. ${score}`);
  }
  syncHud();
}

function checkRoundEnd() {
  if (rounds.state.phase !== 'live') return;
  const bomb = rounds.state.bomb;
  const emberAlive = (player.state.alive ? 1 : 0) + bots.aliveCount('ember');
  const slateAlive = bots.aliveCount('slate');
  if (bomb.state === 'planted') {
    if (bomb.timer <= 0) {
      endRound('ember', 'Charge detonated');
      return;
    }
    if (slateAlive === 0) {
      endRound('ember', 'Defenders eliminated — charge detonates');
      return;
    }
  } else {
    if (slateAlive === 0) {
      endRound('ember', 'Slate eliminated');
      return;
    }
    if (emberAlive === 0) {
      endRound('slate', 'Ember eliminated');
      return;
    }
    if (rounds.state.timer <= 0) {
      endRound('slate', 'Time expired — Slate holds the yard');
    }
  }
}

// ---------- HUD sync ----------

function syncHud() {
  const ps = player.state;
  const def = weaponSet.def();
  hud.setHealth(ps.health, ps.armor);
  hud.setAmmo(weaponSet.state.mag, weaponSet.state.reserve, def.name);
  hud.setMoney(rounds.state.money);
  hud.setGrenades(weaponSet.state.frag, weaponSet.state.flashCount, weaponSet.state.grenade);
  hud.setTimer(rounds.state.timer, rounds.state.phase);
  hud.setScore(rounds.state.scoreEmber, rounds.state.scoreSlate, rounds.state.round);
  hud.setAlive(
    (ps.alive ? 1 : 0) + bots.aliveCount('ember'),
    bots.aliveCount('slate'),
  );
  const bomb = rounds.state.bomb;
  if (bomb.state === 'planted') {
    hud.setBomb(`CHARGE PLANTED — Site ${bomb.site} · ${Math.max(0, Math.ceil(bomb.timer))}s`);
  } else if (bomb.state === 'carried') {
    const carrier = bots.carrier();
    hud.setBomb(carrier ? `CHARGE — ${carrier.name} carries it` : `CHARGE — you carry it · ${siteTargetLabel()}`);
  } else {
    hud.setBomb('');
  }
}

function syncCamera() {
  if (!player.state.alive && state.spectating && state.spectating.alive) {
    const bot = state.spectating;
    camera.position.set(bot.body.position.x, bot.body.position.y + 1.62, bot.body.position.z);
    camera.rotation.set(0, bot.body.yaw, 0, 'YXZ');
    return;
  }
  const body = player.state.body;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

// ---------- input handling ----------

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
    hud.hideBuy();
    if (rounds.state.phase === 'buy') deploy();
    return;
  }
  if (rounds.state.phase === 'live' && player.state.alive) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  const phase = rounds.state.phase;
  if (phase === 'lobby') {
    hud.hideOverlay();
    startMatch();
  } else if (phase === 'roundEnd') {
    hud.hideOverlay();
    nextRound();
  } else if (phase === 'matchEnd') {
    hud.hideOverlay();
    startMatch();
  } else if (phase === 'live') {
    hud.hideOverlay();
    if (player.state.alive) input.requestLock();
  }
});

hud.onBuyClose(() => {
  deploy();
});

function handlePressed(pressed) {
  if (pressed.has('KeyM')) {
    const muted = audio.toggleMute();
    hud.banner(muted ? 'Sound muted' : 'Sound on', '', 1200);
  }
  if (rounds.state.phase === 'buy') {
    if (pressed.has('KeyB') || pressed.has('Enter')) {
      deploy();
      return;
    }
    if (hud.isBuyOpen()) {
      const rows = ['rifle', 'smg', 'shotgun', 'dmr', 'frag', 'flash', 'armor'];
      for (let i = 0; i < rows.length; i += 1) {
        if (pressed.has(`Digit${i + 1}`)) {
          const key = rows[i];
          if (key === 'frag' || key === 'flash') buyGrenade(key);
          else if (key === 'armor') buyArmor();
          else buyWeapon(key);
        }
      }
    }
    return;
  }
  if (rounds.state.phase !== 'live') return;
  if (pressed.has('KeyR')) {
    if (weaponSet.reload()) audio.reload();
  }
  if (pressed.has('KeyB')) {
    hud.banner('Buy phase is over', 'Buy before the round starts', 1600);
  }
  if (pressed.has('KeyG')) throwGrenade('frag');
  if (pressed.has('KeyF')) throwGrenade('flash');
  if (pressed.has('KeyQ')) {
    weaponSet.state.grenade = weaponSet.state.grenade === 'frag' ? 'flash' : 'frag';
    syncHud();
  }
  for (const key of Object.keys(WEAPONS)) {
    if (pressed.has(`Digit${WEAPONS[key].slot}`)) {
      if (weaponSet.equip(key)) {
        audio.reload();
        syncHud();
      }
    }
  }
}

// ---------- simulation step ----------

function step(dt) {
  state.elapsed += dt;
  const phase = rounds.state.phase;
  if (phase === 'live' || phase === 'buy') {
    rounds.step(dt);
    weaponSet.step(dt);
  }
  if (phase === 'live') {
    const look = input.takeLook();
    if (player.state.alive && !player.state.flash) player.look(look.x, look.y);
    else if (player.state.alive) player.look(look.x * 0.3, look.y * 0.3);
    if (player.state.alive) {
      const sprint = input.state.keys.has('ShiftLeft') || input.state.keys.has('ShiftRight');
      player.step(dt, input.state.keys, sprint);
      if (input.state.firing && weaponSet.ready()) playerShoot();
      stepChannel(dt);
      updateChannel(dt);
    }
    bots.step(dt, state.elapsed, {
      player: player.state,
      bomb: rounds.state.bomb,
      noise: state.noise,
      onBotShoot: botShoot,
      onChannelDone,
    });
    ballistics.step(dt, state.elapsed, {
      onExplosion,
      onFlash,
      onBounce: () => audio.bounce(),
      onBombBeep: () => audio.beep(false),
    });
    effects.step(dt);
    checkRoundEnd();
    state.noise = [];
  } else if (phase === 'buy') {
    // Freeze time: everyone waits at spawn while the player buys.
    effects.step(dt);
  }
  const pressed = input.takePressed();
  if (pressed.size > 0) handlePressed(pressed);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - state.lastTime) / 1000, 0.1);
  state.lastTime = now;
  if (!state.frozen) {
    state.accumulator += dt;
    let steps = 0;
    while (state.accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      state.accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (state.accumulator > FIXED_STEP * 5) state.accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

// ---------- screenshot staging ----------

function aimAt(point) {
  const body = player.state.body;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      state.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function placeBot(bot, x, z, yaw) {
  bot.body.position.set(x, 0, z);
  bot.body.velocity.set(0, 0, 0);
  bot.body.yaw = yaw;
  bot.parts.group.position.set(x, 0, z);
  bot.parts.group.rotation.y = yaw;
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  hud.hideBanner();
  const emberBots = bots.list.filter((b) => b.team === 'ember');
  const slateBots = bots.list.filter((b) => b.team === 'slate');
  player.state.body.position.set(0, 0, 16);
  player.state.body.yaw = 0;
  player.state.body.pitch = 0;
  player.state.alive = true;
  player.state.health = 100;
  player.state.armor = 0;

  if (name === 'start') {
    rounds.startMatch();
    respawnAll();
    rounds.state.phase = 'buy';
    openBuy();
    hud.hideBuy();
    player.state.body.position.set(0.6, 0, 15.5);
    aimAt(_to.set(0, 1.4, -8));
    hud.showOverlay('start');
    syncHud();
  } else if (name === 'play') {
    rounds.startMatch();
    respawnAll();
    rounds.state.phase = 'live';
    rounds.state.scoreEmber = 1;
    rounds.state.timer = 62;
    rounds.state.money = 1250;
    weaponSet.buy('rifle');
    weaponSet.equip('rifle');
    weaponSet.state.mag = 24;
    weaponSet.state.reserve = 90;
    player.state.body.position.set(0, 0, 4);
    placeBot(emberBots[0], -2.5, 7, Math.PI * 0.95);
    placeBot(emberBots[1], 3.5, 8, Math.PI * 1.05);
    placeBot(slateBots[0], 2.5, -6, Math.PI * 0.1);
    placeBot(slateBots[1], -4, -9, Math.PI * 0.9);
    placeBot(slateBots[2], 8, -4, Math.PI * 0.5);
    settle(10);
    aimAt(_to.set(2.5, 1.2, -6));
    playerShoot();
    settle(2);
    playerShoot();
    settle(2);
    playerShoot();
    syncHud();
  } else if (name === 'plant') {
    rounds.startMatch();
    respawnAll();
    rounds.state.phase = 'live';
    rounds.state.scoreEmber = 2;
    rounds.state.scoreSlate = 1;
    rounds.state.timer = 32;
    rounds.state.money = 900;
    rounds.plant(SITES.A, SITES.A.x, SITES.A.z);
    ballistics.showBomb(SITES.A.x, SITES.A.z);
    player.state.body.position.set(-10.5, 0, -9.5);
    placeBot(emberBots[0], -12, -8, Math.PI * 0.15);
    placeBot(emberBots[1], -16, -9, Math.PI * 0.3);
    placeBot(slateBots[0], -7.5, -7.5, Math.PI * 0.85);
    placeBot(slateBots[1], 6, -11, Math.PI * 0.7);
    placeBot(slateBots[2], 12, -8, Math.PI * 0.6);
    settle(10);
    aimAt(_to.set(-7.5, 1.2, -7.5));
    hud.banner('CHARGE PLANTED', 'Site A — defend it', 60000);
    syncHud();
  } else {
    // end: round won, banner up, fallen defenders at the site.
    rounds.startMatch();
    respawnAll();
    rounds.state.phase = 'roundEnd';
    rounds.state.scoreEmber = 3;
    rounds.state.scoreSlate = 1;
    rounds.state.timer = 0;
    player.state.body.position.set(-10, 0, -8);
    placeBot(emberBots[0], -12, -10, Math.PI * 0.2);
    placeBot(emberBots[1], -8, -12, Math.PI * 0.1);
    for (const bot of slateBots) {
      bot.alive = false;
      bot.fall = 1;
      bot.parts.group.rotation.x = -1.5;
      bot.parts.group.position.y = -0.15;
    }
    placeBot(slateBots[0], -13, -12, Math.PI * 0.4);
    placeBot(slateBots[1], -15, -14, Math.PI * 0.6);
    placeBot(slateBots[2], -11, -14, Math.PI * 0.3);
    settle(6);
    aimAt(_to.set(-13, 1, -12));
    hud.banner('ROUND WON', 'Site A secured · Ember 3 — 1 Slate', 60000);
    syncHud();
  }
  syncCamera();
  paintTwiceThenReady();
}

// Debug handle for automated play-testing (read-only state snapshot).
window.__emberline = {
  get player() { return player.state; },
  get yaw() { return player.state.body.yaw; },
  get locked() { return document.pointerLockElement === renderer.domElement; },
  get firing() { return input.state.firing; },
  get velocity() { return { x: player.state.body.velocity.x, z: player.state.body.velocity.z }; },
  get rounds() { return rounds.state; },
  get bots() { return bots.list.map((b) => ({ name: b.name, team: b.team, alive: b.alive, x: b.body.position.x, z: b.body.position.z })); },
  get weapon() { return { current: weaponSet.state.current, mag: weaponSet.state.mag, reserve: weaponSet.state.reserve, owned: { ...weaponSet.owned } }; },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Boot: lobby with the start overlay; the first click starts the match.
respawnAll();
rounds.state.phase = 'lobby';
hud.showOverlay('start');
syncHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
