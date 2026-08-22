'use client';

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

type SupportedFormat = 'stl' | 'obj' | '3mf';
type ViewerState = 'idle' | 'loading' | 'ready' | 'error';
type MaterialKey = 'pla' | 'petg';
type UnitKey = 'mm' | 'cm' | 'in';

type ModelMetadata = {
  format: SupportedFormat;
  fileName: string;
  fileSize: number;
  dimensionsMm: THREE.Vector3;
  volumeMm3: number | null;
  triangleCount: number;
};

type PricingConfig = {
  density: number;
  rate: number;
  label: string;
  color: string;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MATERIALS: Record<MaterialKey, PricingConfig> = {
  pla: { density: 1.24, rate: 6, label: 'PLA', color: '#b9f26c' },
  petg: { density: 1.27, rate: 8, label: 'PETG', color: '#7dd3fc' },
};
const UNIT_FACTORS: Record<UnitKey, number> = { mm: 1, cm: 0.1, in: 1 / 25.4 };
const UNIT_LABELS: Record<UnitKey, string> = { mm: 'mm', cm: 'cm', in: 'in' };

function getFormat(fileName: string): SupportedFormat | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension === 'stl' || extension === 'obj' || extension === '3mf' ? extension : null;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: digits }).format(value);
}

function parseModel(file: File, format: SupportedFormat) {
  return file.arrayBuffer().then((data) => {
    if (format === 'stl') {
      const geometry = new STLLoader().parse(data);
      geometry.computeVertexNormals();
      return new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: MATERIALS.pla.color, roughness: 0.68, metalness: 0.05 }),
      );
    }

    if (format === 'obj') return new OBJLoader().parse(new TextDecoder().decode(data));
    return new ThreeMFLoader().parse(data);
  });
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
    else if (mesh.material) mesh.material.dispose();
  });
}

function applyModelStyle(object: THREE.Object3D, color: string, wireframe: boolean) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.filter(Boolean).forEach((material) => {
      const modelMaterial = material as THREE.MeshStandardMaterial;
      if (modelMaterial.color) modelMaterial.color.set(color);
      if ('wireframe' in modelMaterial) modelMaterial.wireframe = wireframe;
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

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerHostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);

  const [viewerState, setViewerState] = useState<ViewerState>('idle');
  const [metadata, setMetadata] = useState<ModelMetadata | null>(null);
  const [error, setError] = useState('');
  const [materialKey, setMaterialKey] = useState<MaterialKey>('pla');
  const [unit, setUnit] = useState<UnitKey>('mm');
  const [infill, setInfill] = useState(20);
  const [wireframe, setWireframe] = useState(false);
  const [gridVisible, setGridVisible] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [modelColor, setModelColor] = useState(MATERIALS.pla.color);

  useEffect(() => {
    const host = viewerHostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#10172a');
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100000);
    camera.position.set(80, 65, 105);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight('#dbeafe', '#111827', 2.1));
    const keyLight = new THREE.DirectionalLight('#ffffff', 3.2);
    keyLight.position.set(90, 120, 70);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const fillLight = new THREE.PointLight('#7dd3fc', 30, 500);
    fillLight.position.set(-90, 40, -80);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(160, 32, '#334155', '#1e293b');
    grid.position.y = -38;
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
    rendererRef.current = renderer;
    controlsRef.current = controls;
    gridRef.current = grid;

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      if (modelRef.current) disposeObject(modelRef.current);
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
    if (modelRef.current) applyModelStyle(modelRef.current, modelColor, wireframe);
  }, [modelColor, wireframe]);

  const fitModel = () => {
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
    controls.target.set(0, 0, 0);
    controls.saveState();
    if (gridRef.current) gridRef.current.scale.setScalar(Math.max(1, maxSize / 70));
  };

  const loadFile = async (file: File) => {
    const format = getFormat(file.name);
    if (!format) {
      setViewerState('error');
      setError('الصيغة غير مدعومة. ارفع STL أو OBJ أو 3MF.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setViewerState('error');
      setError('الملف أكبر من 50MB. جرّب تصدير نسخة أخف.');
      return;
    }

    setViewerState('loading');
    setError('');
    try {
      const model = await parseModel(file, format);
      // Printing files are typically Z-up; the viewer uses Y as its vertical axis.
      model.rotation.x = -Math.PI / 2;
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const dimensionsMm = box.getSize(new THREE.Vector3());
      const { volumeMm3, triangleCount } = calculateVolumeAndTriangles(model);

      if (modelRef.current && sceneRef.current) {
        sceneRef.current.remove(modelRef.current);
        disposeObject(modelRef.current);
      }
      modelRef.current = model;
      sceneRef.current?.add(model);
      applyModelStyle(model, modelColor, wireframe);
      setMetadata({ fileName: file.name, fileSize: file.size, format, dimensionsMm, volumeMm3, triangleCount });
      setViewerState('ready');
      requestAnimationFrame(fitModel);
    } catch {
      setViewerState('error');
      setError('لم نقدر نقرأ الملف. تأكد أنه ملف 3D سليم ثم جرّب مرة ثانية.');
    }
  };

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

  const resetCamera = () => controlsRef.current?.reset();
  const selectedMaterial = MATERIALS[materialKey];
  const volumeCm3 = metadata?.volumeMm3 ? metadata.volumeMm3 / 1000 : null;
  const dimensions = metadata?.dimensionsMm
    ? ['x', 'y', 'z'].map((_, index) => `${formatNumber(metadata.dimensionsMm.getComponent(index) * UNIT_FACTORS[unit])} ${UNIT_LABELS[unit]}`).join(' × ')
    : '—';
  const effectiveFraction = Math.min(1, 0.15 + (infill / 100) * 0.85);
  const estimatedWeight = volumeCm3 ? volumeCm3 * selectedMaterial.density * effectiveFraction : null;
  const estimatedPrice = estimatedWeight ? estimatedWeight * selectedMaterial.rate : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">◎</div>
          <div><p className="eyebrow">3D WORKSPACE</p><h1>3D Preview</h1></div>
        </div>
        <div className="topbar-note"><span className="online-dot" /> الملف يفضل على جهازك</div>
        <button className="primary-button compact" onClick={() => fileInputRef.current?.click()}>+ رفع ملف</button>
      </header>

      <div className="workspace">
        <section className="viewer-card" aria-label="مساحة عرض التصميم ثلاثي الأبعاد">
          <div className="viewer-header">
            <div><p className="eyebrow">LIVE PREVIEW</p><strong>{metadata?.fileName ?? 'لم يتم اختيار تصميم بعد'}</strong></div>
            <div className="viewer-badges">
              <span className="soft-badge">{metadata ? metadata.format.toUpperCase() : 'STL · OBJ · 3MF'}</span>
              <button className="ghost-button" onClick={resetCamera} disabled={!metadata}>إعادة ضبط العرض</button>
            </div>
          </div>

          <div className="viewer-stage" ref={viewerHostRef}>
            {viewerState !== 'ready' && (
              <div className="stage-message" role="status" aria-live="polite">
                <div className="upload-orb">↥</div>
                <h2>{viewerState === 'loading' ? 'بنجهز المعاينة…' : 'ارفع تصميمك وابدأ'}</h2>
                <p>{viewerState === 'loading' ? 'ثواني ونظهر المجسم هنا.' : 'اسحب ملفك هنا أو استخدم زر الرفع.'}</p>
                {viewerState === 'idle' && <span className="format-note">STL · OBJ · 3MF / حتى 50MB</span>}
                {viewerState === 'error' && <div className="error-message">{error}</div>}
              </div>
            )}
            {viewerState === 'ready' && <div className="stage-hint">اسحب للتدوير · عجلة الماوس للتكبير · زر يمين للتحريك</div>}
          </div>

          <div className="viewer-toolbar">
            <div className="toolbar-group">
              <button className={`tool-button ${autoRotate ? 'active' : ''}`} onClick={() => setAutoRotate((value) => !value)} aria-pressed={autoRotate}>◌ دوران تلقائي</button>
              <button className={`tool-button ${gridVisible ? 'active' : ''}`} onClick={() => setGridVisible((value) => !value)} aria-pressed={gridVisible}>▦ الشبكة</button>
              <button className={`tool-button ${wireframe ? 'active' : ''}`} onClick={() => setWireframe((value) => !value)} aria-pressed={wireframe}>⌗ Wireframe</button>
            </div>
            <span className="viewer-tip">تجربة محلية وآمنة</span>
          </div>
        </section>

        <aside className="control-panel">
          <div className="panel-intro">
            <p className="eyebrow accent">ابدأ من هنا</p>
            <h2>شوف تصميمك<br />قبل ما تطبعه.</h2>
            <p>عاين التفاصيل، افهم الحجم، وخد فكرة عن التكلفة في مساحة واحدة.</p>
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
            <span className="dropzone-title">اسحب الملف هنا</span>
            <span className="dropzone-subtitle">أو اضغط لاختيار ملف من جهازك</span>
            <span className="dropzone-formats">STL · OBJ · 3MF <i>حتى 50MB</i></span>
          </label>

          {metadata && (
            <section className="info-section">
              <div className="section-heading"><span>بيانات التصميم</span><span className="file-chip">.{metadata.format}</span></div>
              <div className="stat-grid">
                <div><span>الحجم</span><strong>{formatBytes(metadata.fileSize)}</strong></div>
                <div><span>المثلثات</span><strong>{formatNumber(metadata.triangleCount, 0)}</strong></div>
                <div className="wide-stat"><span>الأبعاد ({UNIT_LABELS[unit]})</span><strong>{dimensions}</strong></div>
              </div>
              <div className="control-row">
                <label htmlFor="unit">وحدة القياس</label>
                <select id="unit" value={unit} onChange={(event) => setUnit(event.target.value as UnitKey)}>
                  <option value="mm">ميليمتر (mm)</option>
                  <option value="cm">سنتيمتر (cm)</option>
                  <option value="in">بوصة (in)</option>
                </select>
              </div>
            </section>
          )}

          <section className="pricing-card">
            <div className="section-heading"><span>تقدير التكلفة</span><span className="estimate-badge">مبدئي</span></div>
            <div className="pricing-controls">
              <label>الخامة<select value={materialKey} onChange={(event) => { const next = event.target.value as MaterialKey; setMaterialKey(next); setModelColor(MATERIALS[next].color); }}><option value="pla">PLA · عملي وخفيف</option><option value="petg">PETG · أقوى ومتين</option></select></label>
              <label>الامتلاء <output>{infill}%</output><input type="range" min="10" max="100" step="5" value={infill} onChange={(event) => setInfill(Number(event.target.value))} /></label>
            </div>
            <div className="price-result">
              <span>السعر التقريبي</span>
              <strong>{estimatedPrice ? `${formatNumber(estimatedPrice)} <small>ج.م</small>` : '—'}</strong>
              <p>{estimatedWeight ? `وزن متوقع ${formatNumber(estimatedWeight, 1)} جم · سعر ${selectedMaterial.rate} ج.م/جم` : 'ارفع ملفًا مغلقًا وقابلًا للحساب لإظهار التقدير'}</p>
            </div>
            <p className="fine-print">التقدير يعتمد على الحجم والامتلاء فقط، وليس عرض سعر نهائيًا.</p>
          </section>

          <div className="privacy-note"><span>◉</span><p><strong>خصوصيتك أولًا</strong><br />الملف لا يغادر جهازك ولا يتم حفظه على أي سيرفر.</p></div>
        </aside>
      </div>

      <footer className="footer-note"><span>3D Preview / v1</span><span>مصمم للمعاينة السريعة قبل الطباعة</span></footer>
    </main>
  );
}
