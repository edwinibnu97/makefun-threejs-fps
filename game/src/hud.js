// The DOM HUD: health, armour, ammo, money, timer, score, alive counts, kill
// feed, crosshair, hit marker, bomb status, plant/defuse progress, banners,
// the buy menu and the start/pause/end overlays. It never touches the
// simulation; main.js pushes numbers in and reads the button callbacks out.
import { WEAPONS, GRENADES } from './weapons.js';

function $(id) {
  return document.getElementById(id);
}

const OVERLAY_COPY = {
  start: {
    title: 'Emberline',
    copy: 'Ashworks Yard. Ember attacks — plant the spark charge at Site A or Site B, or eliminate Slate. Slate defends. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'Emberline',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
  dead: {
    title: 'You are down',
    copy: 'Your team fights on. Spectate until the round ends.',
    action: 'Spectate',
  },
};

export function createHud(callbacks) {
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const playButton = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const vignette = $('damage-vignette');
  const flashOverlay = $('flash-overlay');
  const healthNum = $('health-num');
  const healthBar = $('health-fill');
  const armorBar = $('armor-fill');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyEl = $('money');
  const timerEl = $('timer');
  const scoreEmber = $('score-ember');
  const scoreSlate = $('score-slate');
  const roundNum = $('round-num');
  const aliveEmber = $('alive-ember');
  const aliveSlate = $('alive-slate');
  const killfeed = $('killfeed');
  const bombStatus = $('bomb-status');
  const channel = $('channel');
  const channelLabel = $('channel-label');
  const channelFill = $('channel-fill');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buy-menu');
  const buyItems = $('buy-items');
  const buyMoney = $('buy-money');
  const grenadeEl = $('grenades');

  let hitTimer = 0;
  let bannerTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHealth = -1;
  let lastArmor = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';

  function formatTimer(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function renderBuy(money, owned, frag, flashCount, hasArmor) {
    buyMoney.textContent = `$${money}`;
    buyItems.innerHTML = '';
    const rows = [];
    for (const key of ['rifle', 'smg', 'shotgun', 'dmr']) {
      const def = WEAPONS[key];
      rows.push({
        key, kind: 'weapon', label: def.name, detail: `${def.damage} dmg · ${def.magSize} rounds`,
        price: def.price, owned: !!owned[key], disabled: !!owned[key] || money < def.price,
      });
    }
    rows.push({
      key: 'frag', kind: 'grenade', label: GRENADES.frag.name,
      detail: `Blast radius ${GRENADES.frag.radius} m`, price: GRENADES.frag.price,
      owned: frag > 0, disabled: money < GRENADES.frag.price,
    });
    rows.push({
      key: 'flash', kind: 'grenade', label: GRENADES.flash.name,
      detail: 'Blinds anyone looking at it', price: GRENADES.flash.price,
      owned: flashCount > 0, disabled: money < GRENADES.flash.price,
    });
    rows.push({
      key: 'armor', kind: 'armor', label: 'Kevlar Vest', detail: `Absorbs half of all damage`,
      price: 650, owned: hasArmor, disabled: hasArmor || money < 650,
    });
    rows.forEach((row, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-row';
      button.disabled = row.disabled;
      button.innerHTML = `<span class="buy-key">${index + 1}</span><span class="buy-name">${row.label}</span>` +
        `<span class="buy-detail">${row.detail}</span>` +
        `<span class="buy-price">${row.owned ? 'Owned' : '$' + row.price}</span>`;
      button.addEventListener('click', () => {
        if (row.kind === 'weapon') callbacks.onBuyWeapon(row.key);
        else if (row.kind === 'grenade') callbacks.onBuyGrenade(row.key);
        else callbacks.onBuyArmor();
      });
      buyItems.appendChild(button);
    });
  }

  return {
    setHealth(health, armor) {
      const hp = Math.max(0, Math.round(health));
      if (hp !== lastHealth) {
        lastHealth = hp;
        healthNum.textContent = String(hp);
        healthBar.style.width = `${hp}%`;
        healthBar.classList.toggle('low', hp <= 30);
      }
      const ar = Math.max(0, Math.round(armor));
      if (ar !== lastArmor) {
        lastArmor = ar;
        armorBar.style.width = `${Math.min(100, ar * 2)}%`;
      }
    },
    setAmmo(mag, reserve, name) {
      if (mag !== lastMag || reserve !== lastReserve) {
        lastMag = mag;
        lastReserve = reserve;
        ammoMag.textContent = String(mag);
        ammoReserve.textContent = `/ ${reserve}`;
        $('ammo').classList.toggle('empty', mag === 0);
      }
      weaponName.textContent = name;
    },
    setMoney(money) {
      if (money !== lastMoney) {
        lastMoney = money;
        moneyEl.textContent = `$${money}`;
      }
    },
    setGrenades(frag, flashCount, active) {
      grenadeEl.textContent = `Frag ${frag} · Flash ${flashCount}${active ? ` · [${active}]` : ''}`;
    },
    setTimer(seconds, phase) {
      const text = phase === 'buy' ? 'BUY' : formatTimer(seconds);
      if (text !== lastTimer) {
        lastTimer = text;
        timerEl.textContent = text;
        timerEl.classList.toggle('urgent', phase === 'live' && seconds <= 15);
      }
    },
    setScore(ember, slate, round) {
      const text = `${ember}-${slate}|${round}`;
      if (text !== lastScore) {
        lastScore = text;
        scoreEmber.textContent = String(ember);
        scoreSlate.textContent = String(slate);
        roundNum.textContent = `Round ${round}`;
      }
    },
    setAlive(ember, slate) {
      const text = `${ember}|${slate}`;
      if (text !== lastAlive) {
        lastAlive = text;
        aliveEmber.textContent = '●'.repeat(ember) + '○'.repeat(Math.max(0, 3 - ember));
        aliveSlate.textContent = '●'.repeat(slate) + '○'.repeat(Math.max(0, 3 - slate));
      }
    },
    setBomb(text) {
      bombStatus.textContent = text;
    },
    setCrosshairSpread(pixels) {
      crosshair.style.setProperty('--gap', `${pixels.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash(strength) {
      vignette.style.opacity = String(Math.min(0.85, strength));
      setTimeout(() => {
        vignette.style.opacity = '0';
      }, 180);
    },
    flashBlind(strength) {
      flashOverlay.style.opacity = String(Math.min(1, strength));
      setTimeout(() => {
        flashOverlay.style.opacity = '0';
      }, 350);
    },
    killfeed(killer, victim, head, killerTeam) {
      const line = document.createElement('div');
      line.className = `feed-line ${killerTeam}`;
      line.textContent = head ? `${killer} ⌖ ${victim}` : `${killer} ✕ ${victim}`;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    setChannel(label, progress) {
      if (progress === null) {
        channel.hidden = true;
        return;
      }
      channel.hidden = false;
      channelLabel.textContent = label;
      channelFill.style.width = `${Math.round(progress * 100)}%`;
    },
    banner(title, sub, holdMs = 2600) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, holdMs);
    },
    hideBanner() {
      banner.hidden = true;
      clearTimeout(bannerTimer);
    },
    showOverlay(mode, scoreText) {
      const text = OVERLAY_COPY[mode];
      overlayTitle.textContent = text.title;
      overlayCopy.textContent = mode === 'roundEnd' || mode === 'matchEnd' ? scoreText : text.copy;
      playButton.textContent = text.action;
      overlay.hidden = false;
      playButton.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playButton.addEventListener('click', handler);
    },
    showBuy(money, owned, frag, flashCount, hasArmor) {
      renderBuy(money, owned, frag, flashCount, hasArmor);
      buyMenu.hidden = false;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    refreshBuy(money, owned, frag, flashCount, hasArmor) {
      if (!buyMenu.hidden) renderBuy(money, owned, frag, flashCount, hasArmor);
    },
    isBuyOpen() {
      return !buyMenu.hidden;
    },
    onBuyClose(handler) {
      $('buy-close').addEventListener('click', handler);
    },
  };
}
