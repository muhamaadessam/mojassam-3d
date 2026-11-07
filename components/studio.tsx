'use client';

import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import SiteHeader from './site-header';
import { estimateCustomPrint, MACHINE_HOURLY_RATE, MATERIALS, PRINT_COLORS, type MaterialKey, type PrintColor } from '@/lib/catalog';
import { COPY, type FileErrorKey } from '@/lib/copy';
import { formatBytes, formatNumber, getFormat, validateModelFile, type SupportedFormat } from '@/lib/model-file';
import { clearPendingFile, readPendingFile } from '@/lib/pending-file';
import { useLanguage } from '@/lib/language';

type ViewerState = 'idle' | 'loading' | 'ready' | 'error';
type UnitKey = 'mm' | 'cm' | 'in';
type OrderState = 'idle' | 'saving' | 'saved' | 'login' | 'failed';
type ModelMetadata = {
  format: SupportedFormat;
  fileName: string;
  fileSize: number;
  dimensionsMm: THREE.Vector3;
  volumeMm3: number | null;
  triangleCount: number;
};

const UNIT_FACTORS: Record<UnitKey, number> = { mm: 1, cm: 0.1, in: 1 / 25.4 };

function getThemeColor(token: string) {
  if (typeof document === 'undefined') return '#ffffff';
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#ffffff';
}

async function parseModel(file: File, format: SupportedFormat) {
  const data = await file.arrayBuffer();
  if (format === 'stl') {
    const geometry = new STLLoader().parse(data);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0.05 }));
  }
  if (format === 'obj') return new OBJLoader().parse(new TextDecoder().decode(data));
  return new ThreeMFLoader().parse(data);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
    else if (mesh.material) mesh.material.dispose();
  });
}

function applyModelStyle(object: THREE.Object3D, color: string) {
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

function calculateVolumeAndTriangles(object: THREE.Object3D) {
  let volume = 0;
  let triangleCount = 0;
  const pointA = new THREE.Vector3();
  const pointB = new THREE.Vector3();
  const pointC = new THREE.Vector3();
  const cross = new THREE.Vector3();

  object.updateMatrixWorld(true);
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const position = mesh.geometry?.getAttribute('position');
    if (!position) return;

    const index = mesh.geometry.getIndex();
    triangleCount += index ? index.count / 3 : position.count / 3;

    const readPoint = (target: THREE.Vector3, vertexIndex: number) =>
      target.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld);

    const addTriangle = (a: number, b: number, c: number) => {
      readPoint(pointA, a);
      readPoint(pointB, b);
      readPoint(pointC, c);
      cross.copy(pointB).cross(pointC);
      volume += pointA.dot(cross) / 6;
    };

    if (index) {
      for (let i = 0; i < index.count; i += 3) addTriangle(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    } else {
      for (let i = 0; i < position.count; i += 3) addTriangle(i, i + 1, i + 2);
    }
  });

  return {
    volumeMm3: Number.isFinite(volume) && Math.abs(volume) > 0.000001 ? Math.abs(volume) : null,
    triangleCount,
  };
}

export default function StudioPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerHostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);

  const { language, toggleLanguage } = useLanguage();
  const [viewerState, setViewerState] = useState<ViewerState>('idle');
  const [metadata, setMetadata] = useState<ModelMetadata | null>(null);
  const [error, setError] = useState<FileErrorKey | null>(null);
  const [materialKey, setMaterialKey] = useState<MaterialKey>('pla');
  const [unit, setUnit] = useState<UnitKey>('mm');
  const [infill, setInfill] = useState(20);
  const [printColor, setPrintColor] = useState<PrintColor>(PRINT_COLORS[0]);
  const printColorRef = useRef(printColor.hex);
  const [gridVisible, setGridVisible] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [estimateRequested, setEstimateRequested] = useState(false);
  const [orderState, setOrderState] = useState<OrderState>('idle');
  const text = COPY[language];

  useEffect(() => {
    document.title = language === 'ar' ? 'Mojassam 3D — عاين تصميمك قبل الطباعة' : 'Mojassam 3D — Preview before you print';
  }, [language]);

  useEffect(() => {
    const host = viewerHostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(getThemeColor('--color-canvas'));
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100000);
    camera.position.set(80, 65, 105);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(getThemeColor('--color-info-soft'), getThemeColor('--color-grid-ground'), 2.1));
    const keyLight = new THREE.DirectionalLight(getThemeColor('--color-white'), 3.2);
    keyLight.position.set(90, 120, 70);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const fillLight = new THREE.PointLight(getThemeColor('--color-info'), 30, 500);
    fillLight.position.set(-90, 40, -80);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(160, 32, getThemeColor('--color-grid-major'), getThemeColor('--color-grid-minor'));
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 0.4;
    controls.maxDistance = 5000;
    controls.target.set(0, 0, 0);

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let animationFrame = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    gridRef.current = grid;

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      if (modelRef.current) disposeObject(modelRef.current);
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
    if (gridRef.current) gridRef.current.visible = gridVisible;
  }, [autoRotate, gridVisible]);

  useEffect(() => {
    printColorRef.current = printColor.hex;
    if (modelRef.current) applyModelStyle(modelRef.current, printColor.hex);
  }, [printColor]);

  const fitModel = useCallback(() => {
    const model = modelRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!model || !camera || !controls) return;

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 1);
    camera.position.set(maxSize * 1.65, maxSize * 1.2, maxSize * 1.9);
    camera.near = Math.max(maxSize / 10000, 0.001);
    camera.far = Math.max(maxSize * 100, 1000);
    camera.updateProjectionMatrix();
    controls.target.copy(box.getCenter(new THREE.Vector3()));
    controls.saveState();
    if (gridRef.current) gridRef.current.scale.setScalar(Math.max(1, maxSize / 70));
  }, []);

  const loadFile = useCallback(async (file: File) => {
    const problem = validateModelFile(file);
    const format = getFormat(file.name);
    if (problem || !format) {
      setViewerState('error');
      setError(problem ?? 'unsupported');
      return;
    }

    setViewerState('loading');
    setError(null);
    setEstimateRequested(false);
    setOrderState('idle');
    try {
      const model = await parseModel(file, format);
      // Printing files are typically Z-up; the viewer uses Y as its vertical axis.
      model.rotation.x = -Math.PI / 2;
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box.min.y;
      const dimensionsMm = box.getSize(new THREE.Vector3());
      const { volumeMm3, triangleCount } = calculateVolumeAndTriangles(model);

      if (modelRef.current && sceneRef.current) {
        sceneRef.current.remove(modelRef.current);
        disposeObject(modelRef.current);
      }
      modelRef.current = model;
      sceneRef.current?.add(model);
      applyModelStyle(model, printColorRef.current);
      setMetadata({ fileName: file.name, fileSize: file.size, format, dimensionsMm, volumeMm3, triangleCount });
      setViewerState('ready');
      requestAnimationFrame(fitModel);
    } catch {
      setViewerState('error');
      setError('parseError');
    }
  }, [fitModel]);

  // Open the file chosen on the home page, then forget it so it does not come back on every visit.
  useEffect(() => {
    void readPendingFile().then((file) => {
      if (!file) return;
      void loadFile(file);
      void clearPendingFile().catch(() => undefined);
    }).catch(() => undefined);
  }, [loadFile]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  const selectedMaterial = MATERIALS[materialKey];
  const dimensions = metadata
    ? [0, 1, 2].map((index) => `${formatNumber(metadata.dimensionsMm.getComponent(index) * UNIT_FACTORS[unit])} ${unit}`).join(' × ')
    : '—';
  const estimate = metadata?.volumeMm3 ? estimateCustomPrint(metadata.volumeMm3, metadata.dimensionsMm, infill, materialKey) : null;
  const money = (value: number) => `${formatNumber(value)} ${text.currency}`;

  const orderFile = async () => {
    if (!metadata?.volumeMm3) return;
    setOrderState('saving');
    try {
      const { x, y, z } = metadata.dimensionsMm;
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'custom', fileName: metadata.fileName, material: materialKey, infill, colorId: printColor.id, volumeMm3: metadata.volumeMm3, dimensionsMm: { x, y, z } }),
      });
      setOrderState(response.status === 401 ? 'login' : response.ok ? 'saved' : 'failed');
    } catch {
      setOrderState('failed');
    }
  };
  const orderMessage = { idle: '', saving: text.orderSaving, saved: text.orderConfirmed, login: text.loginRequired, failed: text.orderFailed }[orderState];

  return (
    <main className="app-shell">
      <SiteHeader
        language={language}
        text={text}
        nav={[{ href: '/', label: text.home }, { href: '#studio', label: text.studioNav }]}
        onToggleLanguage={toggleLanguage}
        onUpload={() => fileInputRef.current?.click()}
      />

      <div className="workspace" id="studio">
        <section className="viewer-card" aria-label={language === 'ar' ? 'مساحة عرض التصميم ثلاثي الأبعاد' : '3D design preview area'}>
          <div className="viewer-header">
            <div><p className="eyebrow">LIVE PREVIEW</p><strong>{metadata?.fileName ?? text.noFile}</strong></div>
            <div className="viewer-badges">
              <span className="soft-badge">{metadata ? metadata.format.toUpperCase() : 'STL · OBJ · 3MF'}</span>
              <button className="ghost-button" onClick={() => controlsRef.current?.reset()} disabled={!metadata}>{text.reset}</button>
            </div>
          </div>

          <div className="viewer-stage" ref={viewerHostRef}>
            {viewerState !== 'ready' && (
              <div className="stage-message" role="status" aria-live="polite">
                <div className="upload-orb">↥</div>
                <h2>{viewerState === 'loading' ? text.loadingTitle : text.idleTitle}</h2>
                <p>{viewerState === 'loading' ? text.loadingBody : text.idleBody}</p>
                {viewerState === 'idle' && <span className="format-note">{text.fileLimit}</span>}
                {viewerState === 'error' && error && <div className="error-message">{text[error]}</div>}
              </div>
            )}
            {viewerState === 'ready' && <div className="stage-hint">{text.stageHint}</div>}
          </div>

          <div className="viewer-toolbar">
            <div className="toolbar-group">
              <button className={`tool-button ${autoRotate ? 'active' : ''}`} onClick={() => setAutoRotate((value) => !value)} aria-pressed={autoRotate}>{text.autoRotate}</button>
              <button className={`tool-button ${gridVisible ? 'active' : ''}`} onClick={() => setGridVisible((value) => !value)} aria-pressed={gridVisible}>{text.grid}</button>
            </div>
            <span className="viewer-tip">{text.localSafe}</span>
          </div>
        </section>

        <aside className="control-panel">
          <div className="panel-intro">
            <p className="eyebrow accent">{text.start}</p>
            <h2>{text.heroLine1}<br />{text.heroLine2}</h2>
            <p>{text.intro}</p>
          </div>

          <label
            className="dropzone"
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <input ref={fileInputRef} type="file" accept=".stl,.obj,.3mf" onChange={handleFileChange} />
            <span className="dropzone-icon">↥</span>
            <span className="dropzone-title">{text.dropTitle}</span>
            <span className="dropzone-subtitle">{text.dropSubtitle}</span>
            <span className="dropzone-formats">STL · OBJ · 3MF <i>{language === 'ar' ? 'حتى 50MB' : 'up to 50MB'}</i></span>
          </label>

          {metadata && (
            <section className="info-section">
              <div className="section-heading"><span>{text.designData}</span><span className="file-chip">.{metadata.format}</span></div>
              <div className="stat-grid">
                <div><span>{text.fileSize}</span><strong>{formatBytes(metadata.fileSize)}</strong></div>
                <div><span>{text.triangles}</span><strong>{formatNumber(metadata.triangleCount, 0)}</strong></div>
                <div className="wide-stat"><span>{text.dimensions} ({unit})</span><strong>{dimensions}</strong></div>
              </div>
              <div className="control-row">
                <label htmlFor="unit">{text.unit}</label>
                <select id="unit" value={unit} onChange={(event) => setUnit(event.target.value as UnitKey)}>
                  <option value="mm">{text.mm}</option>
                  <option value="cm">{text.cm}</option>
                  <option value="in">{text.inches}</option>
                </select>
              </div>
            </section>
          )}

          <section className="pricing-card">
            <div className="section-heading"><span>{text.estimate}</span><span className="estimate-badge">{text.preliminary}</span></div>
            <div className="pricing-controls">
              <label>{text.material}<select value={materialKey} onChange={(event) => setMaterialKey(event.target.value as MaterialKey)}><option value="pla">{text.pla}</option><option value="petg">{text.petg}</option></select></label>
              <label>{text.infill} <output>{infill}%</output><input type="range" min="10" max="100" step="5" value={infill} onChange={(event) => setInfill(Number(event.target.value))} /></label>
              <label className="auto-hours"><span>{text.printHours}</span><output>{estimate ? `${formatNumber(estimate.hours, 2)} ${text.hoursUnit}` : '—'}</output></label>
            </div>
            <div className="color-picker">
              <span>{text.printColor}</span>
              <div className="color-swatches" role="radiogroup" aria-label={text.printColor}>
                {PRINT_COLORS.map((color) => (
                  <button
                    key={color.id}
                    className={`color-swatch ${printColor.id === color.id ? 'selected' : ''}`}
                    style={{ backgroundColor: color.hex }}
                    onClick={() => setPrintColor(color)}
                    aria-label={language === 'ar' ? color.ar : color.en}
                    role="radio"
                    aria-checked={printColor.id === color.id}
                    type="button"
                  />
                ))}
              </div>
            </div>
            {!estimateRequested && (
              <div className="estimate-action">
                <p>{metadata ? text.calculatePrompt : text.noEstimate}</p>
                <button className="primary-button estimate-button" disabled={!estimate} onClick={() => setEstimateRequested(true)}>{text.calculateCost}</button>
              </div>
            )}
            {estimateRequested && (
              <div className="price-result">
                <span>{text.totalCost}</span>
                <strong>{estimate ? <>{formatNumber(estimate.price)} <small>{text.currency}</small></> : '—'}</strong>
                <div className="cost-breakdown">
                  <span>{text.materialCost}<b>{estimate ? money(estimate.materialCost) : '—'}</b></span>
                  <span>{text.machineCost}<b>{estimate ? money(estimate.machineCost) : '—'}</b></span>
                </div>
                <p>{estimate ? text.weightDetails(formatNumber(estimate.weightGrams, 1), formatNumber(selectedMaterial.rate, 0)) : text.noEstimate}</p>
                {estimate && (
                  <div className="estimate-action">
                    <p>{text.orderFileNote}</p>
                    <button className="primary-button estimate-button" disabled={orderState === 'saving' || orderState === 'saved'} onClick={orderFile}>{orderState === 'saving' ? text.orderSaving : text.orderThisFile}</button>
                    {orderMessage && <p role="status" className="studio-order-message">{orderMessage}</p>}
                  </div>
                )}
              </div>
            )}
            <p className="fine-print">{text.estimateNote} · {text.hourlyRate(formatNumber(MACHINE_HOURLY_RATE, 0))}</p>
          </section>

          <div className="privacy-note"><span>◉</span><p><strong>{text.privacyTitle}</strong><br />{text.privacyBody}</p></div>
        </aside>
      </div>

      <footer className="footer-note"><span>Mojassam 3D / v1</span><span>{text.footer}</span></footer>
    </main>
  );
}
