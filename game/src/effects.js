// Pooled visual effects: tracers, impact sparks, explosions. Everything is
// allocated once at boot and reused — the hot loop never news an object. A
// tracer is a stretched box; sparks are a Points cloud with a fixed buffer;
// an explosion is a growing sphere plus a light.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 160;
const BLAST_COUNT = 6;

export function createEffects(scene) {
  const tracerMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffd9a0'), transparent: true, opacity: 0.85, depthWrite: false,
  });
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), tracerMaterial);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;

  const sparkGeometry = new THREE.BufferGeometry();
  const sparkPositions = new Float32Array(SPARK_COUNT * 3);
  const sparkVelocities = new Float32Array(SPARK_COUNT * 3);
  const sparkLife = new Float32Array(SPARK_COUNT);
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMaterial = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.accent), size: 0.07, transparent: true, opacity: 0.95,
    depthWrite: false, sizeAttenuation: true,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkIndex = 0;

  const blasts = [];
  for (let i = 0; i < BLAST_COUNT; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 12),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false,
      }),
    );
    mesh.visible = false;
    scene.add(mesh);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 18);
    scene.add(light);
    blasts.push({ mesh, light, life: 0 });
  }
  let blastIndex = 0;

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();

  return {
    tracer(from, to) {
      const slot = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % TRACER_COUNT;
      dir.subVectors(to, from);
      const length = dir.length();
      if (length < 0.1) return;
      slot.mesh.position.copy(from).addScaledVector(dir, 0.5);
      slot.mesh.lookAt(to);
      slot.mesh.scale.set(1, 1, length);
      slot.mesh.visible = true;
      slot.life = 0.07;
    },
    sparksAt(point, count, speed, random) {
      for (let n = 0; n < count; n += 1) {
        const i = sparkIndex;
        sparkIndex = (sparkIndex + 1) % SPARK_COUNT;
        sparkPositions[i * 3] = point.x;
        sparkPositions[i * 3 + 1] = point.y;
        sparkPositions[i * 3 + 2] = point.z;
        const theta = random() * Math.PI * 2;
        const phi = (random() - 0.5) * Math.PI;
        const s = speed * (0.4 + random() * 0.8);
        sparkVelocities[i * 3] = Math.cos(theta) * Math.cos(phi) * s;
        sparkVelocities[i * 3 + 1] = Math.sin(phi) * s + speed * 0.3;
        sparkVelocities[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * s;
        sparkLife[i] = 0.35 + random() * 0.25;
      }
      sparkGeometry.attributes.position.needsUpdate = true;
    },
    blast(point) {
      const slot = blasts[blastIndex];
      blastIndex = (blastIndex + 1) % BLAST_COUNT;
      slot.mesh.position.copy(point);
      slot.mesh.scale.setScalar(0.4);
      slot.mesh.visible = true;
      slot.mesh.material.opacity = 0.85;
      slot.light.position.copy(point);
      slot.light.intensity = 60;
      slot.life = 0.55;
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) slot.mesh.visible = false;
      }
      let anySpark = false;
      for (let i = 0; i < SPARK_COUNT; i += 1) {
        if (sparkLife[i] <= 0) continue;
        anySpark = true;
        sparkLife[i] -= dt;
        sparkVelocities[i * 3 + 1] -= 9 * dt;
        sparkPositions[i * 3] += sparkVelocities[i * 3] * dt;
        sparkPositions[i * 3 + 1] += sparkVelocities[i * 3 + 1] * dt;
        sparkPositions[i * 3 + 2] += sparkVelocities[i * 3 + 2] * dt;
        if (sparkPositions[i * 3 + 1] < 0.02) {
          sparkPositions[i * 3 + 1] = 0.02;
          sparkVelocities[i * 3 + 1] *= -0.4;
        }
        if (sparkLife[i] <= 0) {
          sparkPositions[i * 3 + 1] = -100;
        }
      }
      if (anySpark) sparkGeometry.attributes.position.needsUpdate = true;
      for (const slot of blasts) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        const t = 1 - slot.life / 0.55;
        slot.mesh.scale.setScalar(0.4 + t * 7);
        slot.mesh.material.opacity = 0.85 * (1 - t);
        slot.light.intensity = 60 * (1 - t);
        if (slot.life <= 0) {
          slot.mesh.visible = false;
          slot.light.intensity = 0;
        }
      }
    },
    reset() {
      for (const slot of tracers) {
        slot.life = 0;
        slot.mesh.visible = false;
      }
      for (let i = 0; i < SPARK_COUNT; i += 1) {
        sparkLife[i] = 0;
        sparkPositions[i * 3 + 1] = -100;
      }
      sparkGeometry.attributes.position.needsUpdate = true;
      for (const slot of blasts) {
        slot.life = 0;
        slot.mesh.visible = false;
        slot.light.intensity = 0;
      }
    },
  };
}
