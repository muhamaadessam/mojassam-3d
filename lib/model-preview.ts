'use client';

import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { toWebp } from './image-webp';
import { getFormat, type SupportedFormat } from './model-file';

const PREVIEW_SIZE = 512;

export async function parseModel(data: ArrayBuffer, format: SupportedFormat) {
  if (format === 'stl') {
    const geometry = new STLLoader().parse(data);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0.05 }));
  }
  if (format === 'obj') return new OBJLoader().parse(new TextDecoder().decode(data));
  return new ThreeMFLoader().parse(data);
}

export function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
    else if (mesh.material) mesh.material.dispose();
  });
}

export function applyModelStyle(object: THREE.Object3D, color: string) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.filter(Boolean).forEach((material) => {
      const modelMaterial = material as THREE.MeshStandardMaterial;
      if (modelMaterial.color) modelMaterial.color.set(color);
      modelMaterial.needsUpdate = true;
    });
  });
}

/** Stands a print file upright (they are usually Z-up) and puts it on the floor at the origin. */
export function placeOnFloor(model: THREE.Object3D) {
  model.rotation.x = -Math.PI / 2;
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  return box;
}

/**
 * Lines the parts of a design up side by side along X, each standing on the floor, with the row centred.
 * Returns the bounding box of the whole row.
 */
export function arrangeParts(parts: THREE.Object3D[]) {
  const boxes = parts.map((part) => new THREE.Box3().setFromObject(part));
  const sizes = boxes.map((box) => box.getSize(new THREE.Vector3()));
  const gap = Math.max(2, ...sizes.map((size) => Math.max(size.x, size.z) * 0.15));
  const width = sizes.reduce((sum, size) => sum + size.x, 0) + gap * Math.max(0, parts.length - 1);
  let cursor = -width / 2;
  parts.forEach((part, index) => {
    const box = boxes[index];
    part.position.x += cursor - box.min.x;
    part.position.z -= (box.min.z + box.max.z) / 2;
    part.position.y -= box.min.y;
    cursor += sizes[index].x + gap;
  });
  const row = new THREE.Box3();
  parts.forEach((part) => row.expandByObject(part));
  return row;
}

// Browsers allow only a few WebGL contexts at once, so previews are drawn one after another.
let queue: Promise<unknown> = Promise.resolve();

type ModelSource = { blob: Blob; name: string };

/** Draws a design (all of its parts, side by side) from a three-quarter angle on a transparent background, as a WebP image. */
export function renderModelPreview(sources: ModelSource[], color: string): Promise<File> {
  const job = queue.then(() => render(sources, color));
  queue = job.catch(() => undefined);
  return job;
}

async function render(sources: ModelSource[], color: string) {
  const model = new THREE.Group();
  const parts = await Promise.all(sources.map(async ({ blob, name }) => {
    const format = getFormat(name);
    if (!format) throw new Error('Unsupported model');
    const part = await parseModel(await blob.arrayBuffer(), format);
    placeOnFloor(part);
    applyModelStyle(part, color);
    return part;
  }));
  if (!parts.length) throw new Error('No model');
  arrangeParts(parts);
  parts.forEach((part) => model.add(part));

  const scene = new THREE.Scene();
  scene.add(model);
  scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x2a2f3a, 1.3));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(90, 120, 70);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x9cc2ff, 1.2);
  rimLight.position.set(-90, 40, -80);
  scene.add(rimLight);

  const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.001);
  const camera = new THREE.PerspectiveCamera(35, 1, radius / 100, radius * 100);
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(35 / 2))) * 1.02;
  camera.position.copy(sphere.center).add(new THREE.Vector3(1.65, 1.2, 1.9).normalize().multiplyScalar(distance));
  camera.lookAt(sphere.center);
  keyLight.target.position.copy(sphere.center);
  keyLight.position.copy(sphere.center).add(new THREE.Vector3(radius * 2, radius * 3, radius * 2));
  rimLight.position.copy(sphere.center).add(new THREE.Vector3(-radius * 2, radius, -radius * 2));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(PREVIEW_SIZE, PREVIEW_SIZE, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    const png = await new Promise<Blob | null>((resolve) => renderer.domElement.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Preview failed');
    return await toWebp(new File([png], 'preview.png', { type: 'image/png' }));
  } finally {
    disposeObject(model);
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
