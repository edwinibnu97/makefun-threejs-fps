// Keyboard and mouse, and the pointer lock that turns the mouse into look.
// Plain browser APIs only. The game reads held keys from `state.keys` each
// fixed step, and one-shot presses (reload, buy, throw, use) from
// `takePressed()`, which clears them — so a press fires once even across the
// fixed steps of one frame.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0 };
  // Headless Chrome fires one phantom mousemove when pointer lock engages
  // (the virtual cursor jumps to 0,0 and the jump is reported as a delta).
  // A real mouse never moves 640 px in a single event, so the first event
  // after each lock is dropped and every event is clamped to a sane flick.
  let ignoreNextMove = false;

  function setKey(event, down) {
    if (event.repeat) {
      if (down) return;
    }
    if (down) {
      if (!keys.has(event.code)) pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
    state.firing = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    if (ignoreNextMove) {
      ignoreNextMove = false;
      return;
    }
    state.lookX += Math.max(-200, Math.min(200, event.movementX));
    state.lookY += Math.max(-200, Math.min(200, event.movementY));
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
  });
  // Clicking the game view re-locks the pointer (after Esc, or if the lock
  // was refused). During the buy phase this also deploys, via onLockChange.
  canvas.addEventListener('click', () => {
    if (!state.locked) requestLock();
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    const wasLocked = state.locked;
    state.locked = document.pointerLockElement === canvas;
    if (state.locked && !wasLocked) ignoreNextMove = true;
    if (!state.locked) {
      keys.clear();
      pressed.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });
  document.addEventListener('pointerlockerror', () => {
    state.locked = false;
    onLockChange(false);
  });

  return {
    state,
    requestLock() {
      try {
        canvas.requestPointerLock();
      } catch {
        // The browser may refuse a lock right after an unlock; the player
        // clicks again and it succeeds.
      }
    },
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    takePressed() {
      const out = pressed;
      pressed.clear();
      return out;
    },
    clearPressed() {
      pressed.clear();
    },
  };
}
