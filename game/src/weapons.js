// The armoury: five weapons and two grenades, each with its own numbers.
// A weapon is data; the state machine (cooldown, reload, kick, flash) is the
// same for all of them. Damage is applied by ballistics.js; this module owns
// the view model, the magazine and the spread that punishes firing on the
// move. Prices are what the buy menu charges.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', slot: 1, name: 'P9 Sidearm', price: 0, kind: 'pistol',
    damage: 26, headMult: 4, magSize: 12, reserve: 48,
    fireGap: 0.22, reloadTime: 1.4, spreadStill: 0.004, spreadMoving: 0.03,
    auto: false, pellets: 1, moveSpeed: 5.2, kick: 0.011,
  },
  rifle: {
    id: 'rifle', slot: 2, name: 'VK-7 Carbine', price: 1400, kind: 'rifle',
    damage: 34, headMult: 4, magSize: 30, reserve: 90,
    fireGap: 0.105, reloadTime: 1.9, spreadStill: 0.0022, spreadMoving: 0.028,
    auto: true, pellets: 1, moveSpeed: 5.0, kick: 0.013,
  },
  smg: {
    id: 'smg', slot: 3, name: 'ARC SMG', price: 1000, kind: 'smg',
    damage: 22, headMult: 4, magSize: 32, reserve: 96,
    fireGap: 0.075, reloadTime: 1.7, spreadStill: 0.006, spreadMoving: 0.036,
    auto: true, pellets: 1, moveSpeed: 5.4, kick: 0.008,
  },
  shotgun: {
    id: 'shotgun', slot: 4, name: 'Riot-12', price: 800, kind: 'shotgun',
    damage: 12, headMult: 2, magSize: 6, reserve: 24,
    fireGap: 0.9, reloadTime: 2.6, spreadStill: 0.03, spreadMoving: 0.05,
    auto: false, pellets: 8, moveSpeed: 4.9, kick: 0.03,
  },
  dmr: {
    id: 'dmr', slot: 5, name: 'Longbow DMR', price: 2100, kind: 'dmr',
    damage: 70, headMult: 2, magSize: 10, reserve: 30,
    fireGap: 0.45, reloadTime: 2.2, spreadStill: 0.0008, spreadMoving: 0.02,
    auto: false, pellets: 1, moveSpeed: 4.8, kick: 0.02,
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, radius: 6, maxDamage: 120, fuse: 1.2 },
  flash: { id: 'flash', name: 'Flashbang', price: 200, radius: 25, fuse: 1.1 },
};

const MUZZLE_TIME = 0.06;

export function createWeaponSet(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2d33'), roughness: 0.6, metalness: 0.4 });

  // One view model per weapon, built from boxes; only the active one shows.
  function buildModel(kind) {
    const model = new THREE.Group();
    const add = (w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      model.add(mesh);
      return mesh;
    };
    if (kind === 'pistol') {
      add(0.07, 0.09, 0.24, 0, 0, -0.1, body);
      add(0.06, 0.14, 0.07, 0, -0.09, 0.04, grip);
    } else if (kind === 'shotgun') {
      add(0.09, 0.09, 0.5, 0, 0, -0.12, body);
      add(0.07, 0.07, 0.42, 0, 0.03, -0.3, dark);
      add(0.08, 0.09, 0.24, 0, -0.02, 0.28, grip);
    } else if (kind === 'dmr') {
      add(0.08, 0.09, 0.55, 0, 0, -0.14, body);
      add(0.05, 0.05, 0.34, 0, 0.03, -0.4, dark);
      add(0.06, 0.06, 0.14, 0, 0.08, -0.1, dark);
      add(0.07, 0.08, 0.2, 0, -0.02, 0.3, grip);
    } else if (kind === 'smg') {
      add(0.08, 0.1, 0.34, 0, 0, -0.08, body);
      add(0.05, 0.05, 0.26, 0, 0.02, -0.26, dark);
      add(0.06, 0.12, 0.06, 0, -0.1, -0.05, grip);
      add(0.07, 0.08, 0.18, 0, -0.02, 0.24, grip);
    } else {
      // rifle
      add(0.09, 0.1, 0.42, 0, 0, -0.1, body);
      add(0.045, 0.045, 0.4, 0, 0.025, -0.38, grip);
      add(0.075, 0.08, 0.22, 0, -0.02, 0.3, grip);
      add(0.06, 0.05, 0.1, 0, 0.07, -0.05, dark);
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  }

  const models = {};
  for (const key of Object.keys(WEAPONS)) models[key] = buildModel(WEAPONS[key].kind);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9,
      depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = {
    pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserve },
  };
  const state = {
    current: 'pistol',
    mag: WEAPONS.pistol.magSize,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    frag: 0,
    flashCount: 0,
    grenade: null,
  };
  models.pistol.visible = true;

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const d = def();
      model.rotation.x = -0.55 * Math.min(1, (d.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = d.magSize - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    owned,
    step,
    models,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.03 + d.kick;
      state.bloom = Math.min(0.05, state.bloom + d.fireGap * 0.16);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || state.mag === d.magSize || state.reserve === 0) return false;
      state.reloadLeft = d.reloadTime;
      return true;
    },
    spread(speed) {
      const d = def();
      const move = Math.min(1, speed / 5.2);
      return d.spreadStill + move * d.spreadMoving + state.bloom;
    },
    equip(id) {
      if (!owned[id] || state.current === id) return false;
      owned[state.current] = { mag: state.mag, reserve: state.reserve };
      state.current = id;
      state.mag = owned[id].mag;
      state.reserve = owned[id].reserve;
      state.cooldown = 0.25;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      for (const key of Object.keys(models)) models[key].visible = key === id;
      return true;
    },
    buy(id) {
      if (owned[id]) return false;
      const d = WEAPONS[id];
      owned[id] = { mag: d.magSize, reserve: d.reserve };
      return true;
    },
    refillAmmo() {
      for (const key of Object.keys(owned)) {
        owned[key].mag = WEAPONS[key].magSize;
        owned[key].reserve = WEAPONS[key].reserve;
      }
      state.mag = WEAPONS[state.current].magSize;
      state.reserve = WEAPONS[state.current].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    resetToPistol() {
      for (const key of Object.keys(owned)) {
        if (key !== 'pistol') delete owned[key];
      }
      state.frag = 0;
      state.flashCount = 0;
      state.grenade = null;
      this.equip('pistol');
      this.refillAmmo();
    },
    muzzleWorld(out) {
      out.set(0.24, -0.16, -0.95);
      return camera.localToWorld(out);
    },
  };
}
