// All sound is synthesised with WebAudio: no audio files, no network. A
// shared noise buffer feeds the percussive sounds; tones come from plain
// oscillators. Every call is fire-and-forget and cheap.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  let stepFlip = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      const length = Math.floor(context.sampleRate * 1);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(when, duration, filterType, frequency, gainValue, quality = 1) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = quality;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(when, Math.random() * 0.5, duration + 0.05);
    source.stop(when + duration + 0.1);
  }

  function tone(when, duration, type, fromFreq, toFreq, gainValue) {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, when);
    if (toFreq !== fromFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), when + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain).connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  function shot(kind) {
    if (!ensure() || muted) return;
    const now = context.currentTime;
    if (kind === 'rifle') {
      noise(now, 0.14, 'lowpass', 2400, 0.9);
      tone(now, 0.09, 'square', 180, 55, 0.35);
    } else if (kind === 'smg') {
      noise(now, 0.09, 'bandpass', 3200, 0.7, 1.4);
      tone(now, 0.06, 'square', 220, 70, 0.25);
    } else if (kind === 'shotgun') {
      noise(now, 0.3, 'lowpass', 1200, 1.0);
      tone(now, 0.18, 'sine', 120, 38, 0.5);
    } else if (kind === 'dmr') {
      noise(now, 0.2, 'highpass', 900, 0.8);
      tone(now, 0.14, 'square', 140, 45, 0.4);
    } else {
      // pistol
      noise(now, 0.1, 'bandpass', 2600, 0.65, 1.2);
      tone(now, 0.07, 'square', 200, 65, 0.28);
    }
  }

  function distantShot() {
    if (!ensure() || muted) return;
    const now = context.currentTime;
    noise(now, 0.12, 'lowpass', 700, 0.22);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
    shot,
    distantShot,
    dryFire() {
      if (!ensure() || muted) return;
      tone(context.currentTime, 0.03, 'square', 900, 700, 0.15);
    },
    reload() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      tone(now, 0.03, 'square', 500, 380, 0.2);
      tone(now + 0.16, 0.03, 'square', 640, 480, 0.2);
      tone(now + 0.55, 0.04, 'square', 760, 560, 0.22);
    },
    hit(head) {
      if (!ensure() || muted) return;
      tone(context.currentTime, 0.05, 'sine', head ? 1560 : 1180, head ? 1560 : 1180, 0.25);
    },
    kill() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      tone(now, 0.07, 'sine', 1240, 1240, 0.28);
      tone(now + 0.07, 0.1, 'sine', 1660, 1660, 0.28);
    },
    hurt() {
      if (!ensure() || muted) return;
      tone(context.currentTime, 0.12, 'sawtooth', 160, 90, 0.2);
    },
    step(run) {
      if (!ensure() || muted) return;
      stepFlip = !stepFlip;
      const now = context.currentTime;
      noise(now, 0.05, 'lowpass', stepFlip ? 420 : 340, run ? 0.1 : 0.05);
    },
    bounce() {
      if (!ensure() || muted) return;
      tone(context.currentTime, 0.05, 'sine', 300, 180, 0.15);
    },
    flash() {
      if (!ensure() || muted) return;
      noise(context.currentTime, 0.25, 'highpass', 2400, 0.5);
    },
    explosion() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      noise(now, 0.9, 'lowpass', 900, 1.0);
      tone(now, 0.7, 'sine', 90, 28, 0.7);
    },
    beep(final) {
      if (!ensure() || muted) return;
      tone(context.currentTime, final ? 0.16 : 0.07, 'sine', final ? 1320 : 990, final ? 1320 : 990, 0.22);
    },
    plant() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      tone(now, 0.08, 'sine', 880, 880, 0.22);
      tone(now + 0.1, 0.08, 'sine', 1100, 1100, 0.22);
      tone(now + 0.2, 0.14, 'sine', 1320, 1320, 0.22);
    },
    defuse() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      tone(now, 0.08, 'sine', 1320, 1320, 0.22);
      tone(now + 0.1, 0.08, 'sine', 1100, 1100, 0.22);
      tone(now + 0.2, 0.14, 'sine', 880, 880, 0.22);
    },
    roundWin() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      [523, 659, 784].forEach((freq, i) => tone(now + i * 0.11, 0.16, 'triangle', freq, freq, 0.25));
    },
    roundLose() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      [392, 330, 262].forEach((freq, i) => tone(now + i * 0.12, 0.18, 'triangle', freq, freq, 0.22));
    },
    buy() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      tone(now, 0.05, 'sine', 880, 880, 0.18);
      tone(now + 0.06, 0.08, 'sine', 1174, 1174, 0.18);
    },
    deny() {
      if (!ensure() || muted) return;
      tone(context.currentTime, 0.09, 'square', 220, 160, 0.15);
    },
  };
}
