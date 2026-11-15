// Procedural textures, painted once onto canvases at load: no image files,
// no network, no downloads. Concrete with stains, corrugated steel, hazard
// striping and crate faces — the map's whole surface language.
import * as THREE from 'three';

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function speckle(ctx, size, random, base, count, alpha) {
  for (let i = 0; i < count; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 1 + random() * 7;
    ctx.fillStyle = base;
    ctx.globalAlpha = alpha * (0.4 + random() * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Mulberry32 again, local so this module needs no import.
function seeded(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createTextures() {
  const random = seeded(1337);

  // Yard concrete: dark slabs with expansion joints and oil stains.
  const floorCanvas = makeCanvas(512);
  const floor = floorCanvas.getContext('2d');
  floor.fillStyle = '#26282e';
  floor.fillRect(0, 0, 512, 512);
  speckle(floor, 512, random, '#1b1d22', 900, 0.5);
  speckle(floor, 512, random, '#31343c', 700, 0.4);
  speckle(floor, 512, random, '#101216', 260, 0.55);
  floor.strokeStyle = '#17191d';
  floor.lineWidth = 3;
  for (let i = 0; i <= 4; i += 1) {
    floor.beginPath();
    floor.moveTo(i * 128, 0);
    floor.lineTo(i * 128, 512);
    floor.stroke();
    floor.beginPath();
    floor.moveTo(0, i * 128);
    floor.lineTo(512, i * 128);
    floor.stroke();
  }
  // Faded centre line down the yard.
  floor.fillStyle = '#8a6d2f';
  floor.globalAlpha = 0.55;
  floor.fillRect(250, 0, 12, 512);
  floor.globalAlpha = 1;
  const floorTexture = toTexture(floorCanvas, 11, 10);

  // Corrugated steel for the perimeter walls.
  const wallCanvas = makeCanvas(256);
  const wall = wallCanvas.getContext('2d');
  wall.fillStyle = '#2b2f36';
  wall.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    const shade = 0.85 + ((x / 16) % 2) * 0.3;
    wall.fillStyle = `rgb(${Math.floor(43 * shade)},${Math.floor(47 * shade)},${Math.floor(54 * shade)})`;
    wall.fillRect(x, 0, 8, 256);
  }
  speckle(wall, 256, random, '#1e2126', 260, 0.5);
  wall.fillStyle = '#3a3f47';
  wall.fillRect(0, 120, 256, 6);
  wall.fillRect(0, 248, 256, 6);
  const wallTexture = toTexture(wallCanvas, 12, 2);

  // Shipping container: ribbed steel, rust at the base, stencil number.
  const containerCanvas = makeCanvas(256);
  const container = containerCanvas.getContext('2d');
  container.fillStyle = '#4a3a28';
  container.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 21) {
    const shade = 0.85 + ((x / 21) % 2) * 0.3;
    container.fillStyle = `rgb(${Math.floor(74 * shade)},${Math.floor(58 * shade)},${Math.floor(40 * shade)})`;
    container.fillRect(x, 0, 10, 256);
  }
  speckle(container, 256, random, '#2c2115', 200, 0.5);
  speckle(container, 256, random, '#6b5636', 120, 0.35);
  container.fillStyle = '#c8b98a';
  container.font = 'bold 44px monospace';
  container.globalAlpha = 0.8;
  container.fillText('07', 96, 140);
  container.globalAlpha = 1;
  const containerTexture = toTexture(containerCanvas, 1, 1);

  // Crate: worn boards with a stencil mark.
  const crateCanvas = makeCanvas(128);
  const crate = crateCanvas.getContext('2d');
  crate.fillStyle = '#5d4c33';
  crate.fillRect(0, 0, 128, 128);
  crate.strokeStyle = '#42351f';
  crate.lineWidth = 4;
  for (let y = 0; y < 128; y += 32) {
    crate.beginPath();
    crate.moveTo(0, y);
    crate.lineTo(128, y);
    crate.stroke();
  }
  crate.strokeStyle = '#6e5c3d';
  crate.lineWidth = 6;
  crate.strokeRect(4, 4, 120, 120);
  crate.fillStyle = '#d8c690';
  crate.font = 'bold 22px monospace';
  crate.globalAlpha = 0.75;
  crate.fillText('A-11', 40, 70);
  crate.globalAlpha = 1;
  const crateTexture = toTexture(crateCanvas, 1, 1);

  // Hazard stripes for the site borders.
  const hazardCanvas = makeCanvas(128);
  const hazard = hazardCanvas.getContext('2d');
  hazard.fillStyle = '#c9a227';
  hazard.fillRect(0, 0, 128, 128);
  hazard.fillStyle = '#15161a';
  for (let i = -128; i < 256; i += 32) {
    hazard.beginPath();
    hazard.moveTo(i, 128);
    hazard.lineTo(i + 64, 0);
    hazard.lineTo(i + 80, 0);
    hazard.lineTo(i + 16, 128);
    hazard.fill();
  }
  const hazardTexture = toTexture(hazardCanvas, 4, 1);

  return { floor: floorTexture, wall: wallTexture, container: containerTexture, crate: crateTexture, hazard: hazardTexture };
}
