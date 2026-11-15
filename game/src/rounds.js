// The match: rounds, money and the charge. Ember attacks, Slate defends.
// A round is won by eliminating the other team, by the charge detonating, or
// by defusing it; the clock running out favours the defenders. First to five
// round wins takes the match. Money buys weapons, grenades and armour in the
// buy phase that opens every round.
import { WEAPONS, GRENADES } from './weapons.js';

export const WIN_ROUNDS = 5;
export const ROUND_TIME = 100;
export const BOMB_TIME = 35;
export const BUY_START_MONEY = 1000;
const ARMOR_PRICE = 650;
const ARMOR_VALUE = 50;
const KILL_REWARD = 300;
const WIN_REWARD = 325;
const LOSS_REWARD = 200;
const PLANT_REWARD = 300;

export function createRounds() {
  const state = {
    phase: 'lobby',
    round: 0,
    scoreEmber: 0,
    scoreSlate: 0,
    money: BUY_START_MONEY,
    timer: ROUND_TIME,
    lossStreak: 0,
    bomb: { state: 'carried', site: null, x: 0, z: 0, timer: BOMB_TIME },
    kills: 0,
    deaths: 0,
    lastReason: '',
    winner: null,
  };

  function startMatch() {
    state.phase = 'buy';
    state.round = 1;
    state.scoreEmber = 0;
    state.scoreSlate = 0;
    state.money = BUY_START_MONEY;
    state.timer = ROUND_TIME;
    state.lossStreak = 0;
    state.kills = 0;
    state.deaths = 0;
    state.lastReason = '';
    state.winner = null;
    state.bomb = { state: 'carried', site: null, x: 0, z: 0, timer: BOMB_TIME };
  }

  function startRound() {
    state.phase = 'buy';
    state.timer = ROUND_TIME;
    state.bomb = { state: 'carried', site: null, x: 0, z: 0, timer: BOMB_TIME };
  }

  function deploy() {
    if (state.phase === 'buy') state.phase = 'live';
  }

  function awardRound(winner, reason) {
    state.lastReason = reason;
    state.winner = winner;
    if (winner === 'ember') {
      state.scoreEmber += 1;
      state.money += WIN_REWARD;
      state.lossStreak = 0;
    } else {
      state.scoreSlate += 1;
      state.money += LOSS_REWARD + Math.min(150, state.lossStreak * 50);
      state.lossStreak += 1;
    }
    state.phase = 'roundEnd';
    if (state.scoreEmber >= WIN_ROUNDS || state.scoreSlate >= WIN_ROUNDS || state.round >= 9) {
      state.phase = 'matchEnd';
    }
  }

  function plant(site, x, z) {
    state.bomb = { state: 'planted', site: site.label, x, z, timer: BOMB_TIME };
    state.money += PLANT_REWARD;
  }

  function defuse() {
    state.bomb.state = 'defused';
  }

  return {
    state,
    startMatch,
    startRound,
    deploy,
    awardRound,
    plant,
    defuse,
    nextRound() {
      state.round += 1;
      startRound();
    },
    onKill() {
      state.kills += 1;
      state.money += KILL_REWARD;
    },
    onDeath() {
      state.deaths += 1;
    },
    buyWeapon(id) {
      const def = WEAPONS[id];
      if (!def || def.price === 0) return false;
      if (state.money < def.price) return false;
      state.money -= def.price;
      return true;
    },
    buyGrenade(type) {
      const def = GRENADES[type];
      if (!def || state.money < def.price) return false;
      state.money -= def.price;
      return true;
    },
    buyArmor() {
      if (state.money < ARMOR_PRICE) return false;
      state.money -= ARMOR_PRICE;
      return true;
    },
    armorPrice() {
      return ARMOR_PRICE;
    },
    armorValue() {
      return ARMOR_VALUE;
    },
    step(dt) {
      if (state.phase === 'live') {
        state.timer -= dt;
        if (state.bomb.state === 'planted') {
          state.bomb.timer -= dt;
        }
      }
    },
  };
}
