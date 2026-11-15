// The map: Ashworks Yard, a dusk-lit foundry yard, 44 by 40 metres. Three
// lanes run south to north — west, mid, east — split by divider walls with one
// cross gap each, and two charge sites wait at the north end. Every box is a
// collider for bodies and a surface a bullet stops on. The nav graph is the
// bots' road map: nodes at the junctions, edges where a body can walk
// straight without crossing a wall.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createTextures } from './textures.js';

// Waypoint nodes: [x, z]. Edges are pairs of node indices.
const NODES = [
  [0, 16], [-5, 13], [5, 13], [0, 10], [-14, 10], [14, 10],
  [0, 4], [-14, 2], [14, 2], [-6, -6], [6, -6], [0, -8],
  [-14, -8], [14, -8], [-14, -13], [-9, -11], [14, -13], [9, -11],
  [0, -16], [-7, -15], [7, -15], [-18, -12], [18, -12], [0, -12],
];
const EDGES = [
  [0, 1], [0, 2], [0, 3], [1, 4], [1, 3], [2, 5], [2, 3],
  [3, 6], [3, 4], [3, 5], [4, 7], [5, 8],
  [6, 9], [6, 10], [6, 11], [7, 9], [7, 12], [8, 10], [8, 13],
  [9, 11], [9, 12], [10, 11], [10, 13], [11, 23],
  [12, 14], [12, 15], [12, 21], [13, 16], [13, 17], [13, 22],
  [14, 15], [14, 21], [15, 19], [16, 17], [16, 22], [17, 20],
  [18, 19], [18, 20], [18, 23], [19, 23], [20, 23],
];

export const SITES = {
  A: { x: -14, z: -13, radius: 4.5, label: 'A' },
  B: { x: 14, z: -13, radius: 4.5, label: 'B' },
};

export const SPAWNS = {
  ember: [
    { x: 0, z: 16, yaw: 0 },
    { x: -3, z: 17, yaw: 0 },
    { x: 3, z: 17, yaw: 0 },
  ],
  slate: [
    { x: 0, z: -16, yaw: Math.PI },
    { x: -3, z: -17, yaw: Math.PI },
    { x: 3, z: -17, yaw: Math.PI },
  ],
};

export function createWorld(scene) {
  const textures = createTextures();
  const group = new THREE.Group();
  scene.add(group);

  const floorMaterial = new THREE.MeshStandardMaterial({ map: textures.floor, roughness: 0.94, metalness: 0.02 });
  const wallMaterial = new THREE.MeshStandardMaterial({ map: textures.wall, roughness: 0.85, metalness: 0.25 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.9, metalness: 0.08 });
  const steelMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3d434d'), roughness: 0.55, metalness: 0.55 });
  const containerMaterial = new THREE.MeshStandardMaterial({ map: textures.container, roughness: 0.8, metalness: 0.3 });
  const crateMaterial = new THREE.MeshStandardMaterial({ map: textures.crate, roughness: 0.9, metalness: 0.02 });
  const hazardMaterial = new THREE.MeshStandardMaterial({
    map: textures.hazard, roughness: 0.85, metalness: 0.05,
    emissive: new THREE.Color('#8a6d1f'), emissiveIntensity: 0.25,
  });
  const emberGlow = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.1,
    emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 1.6,
  });
  const slateGlow = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.slate), roughness: 0.4, metalness: 0.1,
    emissive: new THREE.Color(PALETTE.slate), emissiveIntensity: 1.2,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor and perimeter.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(44.4, 40.4), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0);
  floor.receiveShadow = true;
  group.add(floor);
  box(44.4, 0.4, 40.4, 0, -0.2, 0, darkMaterial);
  box(0.5, 5, 40.4, -22.2, 2.5, 0, wallMaterial);
  box(0.5, 5, 40.4, 22.2, 2.5, 0, wallMaterial);
  box(44.4, 5, 0.5, 0, 2.5, -20.2, wallMaterial);
  box(44.4, 5, 0.5, 0, 2.5, 20.2, wallMaterial);

  // Divider walls: three lanes, one cross gap each (z -8..-4).
  for (const side of [-1, 1]) {
    const x = side * 6.5;
    box(0.6, 3.4, 6, x, 1.7, -11, steelMaterial);
    box(0.6, 3.4, 10, x, 1.7, 1, steelMaterial);
  }

  // Mid-lane cover: a container off the centre line, a low crate south of it.
  box(3.0, 2.6, 1.4, 2.5, 1.3, -2, containerMaterial);
  box(1.2, 1.1, 1.2, -2.5, 0.55, 8, crateMaterial);

  // Site A (north-west): crates and a container to fight around.
  box(1.2, 1.1, 1.2, -11, 0.55, -9, crateMaterial);
  box(1.2, 1.1, 1.2, -17, 0.55, -15.5, crateMaterial);
  box(3.0, 2.6, 1.4, -18.5, 1.3, -12, containerMaterial);
  box(1.2, 2.2, 1.2, -9.5, 1.1, -15.5, crateMaterial);

  // Site B (north-east): mirrored.
  box(1.2, 1.1, 1.2, 11, 0.55, -9, crateMaterial);
  box(1.2, 1.1, 1.2, 17, 0.55, -15.5, crateMaterial);
  box(3.0, 2.6, 1.4, 18.5, 1.3, -12, containerMaterial);
  box(1.2, 2.2, 1.2, 9.5, 1.1, -15.5, crateMaterial);

  // Lane crates: crouch cover on the way north.
  box(1.2, 1.1, 1.2, -14, 0.55, 2, crateMaterial);
  box(1.2, 1.1, 1.2, -16, 0.55, 8, crateMaterial);
  box(1.2, 1.1, 1.2, -11, 0.55, 10, crateMaterial);
  box(1.2, 1.1, 1.2, 14, 0.55, 2, crateMaterial);
  box(1.2, 1.1, 1.2, 16, 0.55, 8, crateMaterial);
  box(1.2, 1.1, 1.2, 11, 0.55, 10, crateMaterial);
  box(1.2, 1.1, 1.2, -3, 0.55, 12, crateMaterial);
  box(1.2, 1.1, 1.2, 3, 0.55, 12, crateMaterial);

  // Site floor markings: hazard border rings and a glowing site letter plate.
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const ring = new THREE.Mesh(new THREE.RingGeometry(site.radius - 0.35, site.radius, 40), hazardMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    ring.receiveShadow = true;
    group.add(ring);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.18, 1.6),
      key === 'A' ? emberGlow : slateGlow,
    );
    plate.position.set(site.x, 0.09, site.z);
    group.add(plate);
  }

  // Spawn markers: a low glowing strip at each team's door.
  const emberStrip = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 0.5), emberGlow);
  emberStrip.position.set(0, 0.05, 18.6);
  group.add(emberStrip);
  const slateStrip = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 0.5), slateGlow);
  slateStrip.position.set(0, 0.05, -18.6);
  group.add(slateStrip);

  // Distant foundry skyline beyond the walls: dark silhouettes and two lit
  // chimneys, purely for the view over the parapet.
  const skyline = new THREE.Group();
  const skylineMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#14161c'), roughness: 1 });
  const chimneyMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1d2026'), roughness: 1,
    emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35,
  });
  const skyBoxes = [
    [-30, 6, -28, 8, 12, 8], [-14, 4, -34, 12, 8, 6], [6, 8, -32, 10, 16, 8],
    [24, 5, -30, 9, 10, 7], [-32, 5, 10, 7, 10, 9], [30, 7, 6, 8, 14, 8],
    [-28, 4, 28, 10, 8, 6], [16, 6, 30, 12, 12, 8],
  ];
  for (const [x, y, z, w, h, d] of skyBoxes) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skylineMaterial);
    mesh.position.set(x, y, z);
    skyline.add(mesh);
  }
  for (const [x, z] of [[-22, -26], [18, -28]]) {
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(2.2, 22, 2.2), chimneyMaterial);
    chimney.position.set(x, 11, z);
    skyline.add(chimney);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.6), emberGlow);
    tip.position.set(x, 22.2, z);
    skyline.add(tip);
  }
  scene.add(skyline);

  // Dusk light: a low amber sun from the west, a cool sky fill, and a soft
  // hemisphere so the shadowed side still reads.
  const sky = new THREE.HemisphereLight(new THREE.Color('#33405a'), new THREE.Color('#191411'), 0.85);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.4);
  sun.position.set(-26, 12, 6);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5fb4d9'), 0.5);
  fill.position.set(14, 10, -14);
  scene.add(fill);
  const siteLightA = new THREE.PointLight(new THREE.Color(PALETTE.accent), 6, 12);
  siteLightA.position.set(SITES.A.x, 3.2, SITES.A.z);
  scene.add(siteLightA);
  const siteLightB = new THREE.PointLight(new THREE.Color(PALETTE.slate), 6, 12);
  siteLightB.position.set(SITES.B.x, 3.2, SITES.B.z);
  scene.add(siteLightB);

  // Nav graph adjacency.
  const adjacency = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  // Breadth-first route between nodes; returns node indices, start included.
  function findRoute(fromIndex, toIndex) {
    if (fromIndex === toIndex) return [fromIndex];
    const previous = new Array(NODES.length).fill(-1);
    const queue = [fromIndex];
    previous[fromIndex] = fromIndex;
    while (queue.length > 0) {
      const current = queue.shift();
      for (const next of adjacency[current]) {
        if (previous[next] !== -1) continue;
        previous[next] = current;
        if (next === toIndex) {
          const path = [toIndex];
          let node = toIndex;
          while (node !== fromIndex) {
            node = previous[node];
            path.push(node);
          }
          path.reverse();
          return path;
        }
        queue.push(next);
      }
    }
    return [fromIndex, toIndex];
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < NODES.length; i += 1) {
      const dx = NODES[i][0] - x;
      const dz = NODES[i][1] - z;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  function nodePosition(index, out) {
    out.set(NODES[index][0], 0, NODES[index][1]);
    return out;
  }

  return {
    colliders,
    shootables,
    group,
    nodes: NODES,
    findRoute,
    nearestNode,
    nodePosition,
  };
}
