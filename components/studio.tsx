'use client';

import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import SiteHeader from './site-header';
import { ShieldIcon, UploadIcon } from './icons';
import { estimateCustomPrint, MAX_ITEM_PARTS, MAX_ORDER_IMAGES, MAX_ORDER_ITEMS, MAX_ORDER_UPLOAD, orderTotal, publicCatalog, type Material, type Pricing, type PrintColor } from '@/lib/catalog';
import OrderExtras, { EMPTY_EXTRAS } from './order-extras';
import ImagePicker, { type PickedImage } from './image-picker';
import { COPY, type FileErrorKey } from '@/lib/copy';
import { formatBytes, formatNumber, getFormat, validateModelFile, type SupportedFormat } from '@/lib/model-file';
import { clearPendingFile, readPendingFile } from '@/lib/pending-file';
import { useLanguage } from '@/lib/language';
import { applyModelStyle, arrangeParts, disposeObject, parseModel, placeOnFloor, renderModelPreview } from '@/lib/model-preview';

type ViewerState = 'idle' | 'loading' | 'ready' | 'error';
type UnitKey = 'mm' | 'cm' | 'in';
type OrderState = 'idle' | 'saving' | 'saved' | 'login' | 'failed' | 'paused' | 'tooLarge' | 'tooMany';
/** One file of the design being previewed. A design split into pieces has one part per piece. */
type Part = {
  key: number;
  file: File;
  format: SupportedFormat;
  dimensionsMm: THREE.Vector3;
  volumeMm3: number | null;
  triangleCount: number;
};
/** A design already added to the order, with the settings it was priced at. */
type CartItem = { key: number; parts: Part[]; material: Material; infill: number; color: PrintColor; quantity: number; unitPrice: number };
type Estimate = ReturnType<typeof estimateCustomPrint>;

const UNIT_FACTORS: Record<UnitKey, number> = { mm: 1, cm: 0.1, in: 1 / 25.4 };

function getThemeColor(token: string) {
  if (typeof document === 'undefined') return '#ffffff';
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#ffffff';
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

/** Price of one piece of a design: its parts print separately, so their estimates add up. */
function estimateDesign(parts: Part[], infill: number, material: Material, pricing: Pricing): Estimate | null {
  if (!parts.length || parts.some((part) => !part.volumeMm3)) return null;
  return parts
    .map((part) => estimateCustomPrint(part.volumeMm3!, part.dimensionsMm, infill, material, pricing))
    .reduce((sum, estimate) => ({
      weightGrams: sum.weightGrams + estimate.weightGrams,
      materialCost: sum.materialCost + estimate.materialCost,
      hours: sum.hours + estimate.hours,
      machineCost: sum.machineCost + estimate.machineCost,
      price: sum.price + estimate.price,
    }));
}

export default function StudioPage({ pricing }: { pricing: Pricing }) {
  const { materials, colors } = publicCatalog(pricing);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerHostRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  /** Holds the parts of the design being previewed. */
  const designRef = useRef<THREE.Group | null>(null);
  const objectsRef = useRef(new Map<number, THREE.Object3D>());
  const partsRef = useRef<Part[]>([]);
  const nextKeyRef = useRef(1);
  const gridRef = useRef<THREE.GridHelper | null>(null);

  const { language, toggleLanguage } = useLanguage();
  const [viewerState, setViewerState] = useState<ViewerState>('idle');
  const [parts, setParts] = useState<Part[]>([]);
  const [error, setError] = useState<FileErrorKey | null>(null);
  const [partsFailed, setPartsFailed] = useState(false);
  const [materialKey, setMaterialKey] = useState(materials[0].id);
  const [extras, setExtras] = useState(EMPTY_EXTRAS);
  const [unit, setUnit] = useState<UnitKey>('mm');
  const [infill, setInfill] = useState(20);
  const [printColor, setPrintColor] = useState<PrintColor>(colors[0]);
  const printColorRef = useRef(printColor.hex);
  const [gridVisible, setGridVisible] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [estimateRequested, setEstimateRequested] = useState(false);
  const [orderState, setOrderState] = useState<OrderState>('idle');
  const [photos, setPhotos] = useState<PickedImage[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const text = COPY[language];

  useEffect(() => {
    document.title = language === 'ar' ? 'استوديو المعاينة وحساب تكلفة الطباعة 3D | Mojassam 3D' : '3D preview & print-cost studio | Mojassam 3D';
  }, [language]);

  useEffect(() => {
    const host = viewerHostRef.current;
    if (!host) return;
    const objects = objectsRef.current;

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
    const design = new THREE.Group();
    scene.add(design);

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

    cameraRef.current = camera;
    controlsRef.current = controls;
    designRef.current = design;
    gridRef.current = grid;

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      objects.forEach(disposeObject);
      objects.clear();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      designRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
    if (gridRef.current) gridRef.current.visible = gridVisible;
  }, [autoRotate, gridVisible]);

  useEffect(() => {
    printColorRef.current = printColor.hex;
    objectsRef.current.forEach((object) => applyModelStyle(object, printColor.hex));
  }, [printColor]);

  const fitModel = useCallback(() => {
    const design = designRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!design || !camera || !controls || !design.children.length) return;

    const box = new THREE.Box3().setFromObject(design);
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

  /** Replaces the list of parts, lines them up in the viewer, and frames them. */
  const commitParts = useCallback((next: Part[]) => {
    partsRef.current = next;
    setParts(next);
    setEstimateRequested(false);
    const objects = next.map((part) => objectsRef.current.get(part.key)).filter((object): object is THREE.Object3D => Boolean(object));
    if (objects.length) arrangeParts(objects);
    setViewerState(next.length ? 'ready' : 'idle');
    requestAnimationFrame(fitModel);
  }, [fitModel]);

  /** Adds files as parts of the design being previewed. */
  const loadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setPartsFailed(false);
    setOrderState('idle');
    if (!partsRef.current.length) setViewerState('loading');
    const added: Part[] = [];
    let problem: FileErrorKey | null = null;
    for (const file of files.slice(0, Math.max(0, MAX_ITEM_PARTS - partsRef.current.length))) {
      const format = getFormat(file.name);
      const invalid = validateModelFile(file);
      if (invalid || !format) {
        problem ??= invalid ?? 'unsupported';
        continue;
      }
      try {
        const object = await parseModel(await file.arrayBuffer(), format);
        const dimensionsMm = placeOnFloor(object).getSize(new THREE.Vector3());
        const { volumeMm3, triangleCount } = calculateVolumeAndTriangles(object);
        applyModelStyle(object, printColorRef.current);
        const key = nextKeyRef.current++;
        objectsRef.current.set(key, object);
        designRef.current?.add(object);
        added.push({ key, file, format, dimensionsMm, volumeMm3, triangleCount });
      } catch {
        problem ??= 'parseError';
      }
    }
    if (!added.length && !partsRef.current.length) {
      setViewerState('error');
      setError(problem ?? 'parseError');
      return;
    }
    setPartsFailed(Boolean(problem));
    commitParts([...partsRef.current, ...added]);
  }, [commitParts]);

  const removeObjects = (keys: number[]) => {
    for (const key of keys) {
      const object = objectsRef.current.get(key);
      if (!object) continue;
      designRef.current?.remove(object);
      disposeObject(object);
      objectsRef.current.delete(key);
    }
  };

  const removePart = (key: number) => {
    removeObjects([key]);
    setPartsFailed(false);
    commitParts(partsRef.current.filter((part) => part.key !== key));
  };

  // Open the file chosen on the home page, then forget it so it does not come back on every visit.
  useEffect(() => {
    void readPendingFile().then((file) => {
      if (!file) return;
      void loadFiles([file]);
      void clearPendingFile().catch(() => undefined);
    }).catch(() => undefined);
  }, [loadFiles]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void loadFiles(files);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    void loadFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const selectedMaterial = materials.find((material) => material.id === materialKey) ?? materials[0];
  const dims = (part: Part) => [0, 1, 2].map((index) => formatNumber(part.dimensionsMm.getComponent(index) * UNIT_FACTORS[unit])).join(' × ') + ` ${unit}`;
  const estimate = estimateDesign(parts, infill, selectedMaterial, pricing);
  const currentIncluded = Boolean(estimateRequested && estimate);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const designTotal = estimate ? orderTotal(pricing, estimate.price, extras.quantity) : 0;
  const orderAll = orderTotal(pricing, cartSubtotal + (currentIncluded && estimate ? estimate.price * extras.quantity : 0), 1);
  const designCount = cart.length + (currentIncluded ? 1 : 0);
  const money = (value: number) => `${formatNumber(value)} ${text.currency}`;
  const colorName = (color: PrintColor) => (language === 'ar' ? color.ar : color.en);
  const materialName = (material: Material) => (material.id === 'pla' ? text.pla : material.id === 'petg' ? text.petg : material.label);
  const fileTitle = parts.length ? `${parts[0].file.name}${parts.length > 1 ? ` + ${parts.length - 1}` : ''}` : text.noFile;

  /** Keeps the current design in the order and clears the viewer for the next one. */
  const addDesign = () => {
    if (!estimate || cart.length >= MAX_ORDER_ITEMS) return;
    setCart([...cart, { key: nextKeyRef.current++, parts: partsRef.current, material: selectedMaterial, infill, color: printColor, quantity: extras.quantity, unitPrice: estimate.price }]);
    removeObjects(partsRef.current.map((part) => part.key));
    commitParts([]);
    setExtras({ ...extras, quantity: 1 });
    setPartsFailed(false);
    setOrderState('idle');
  };

  const orderFiles = async () => {
    const designs: CartItem[] = [...cart, ...(currentIncluded && estimate ? [{ key: 0, parts: partsRef.current, material: selectedMaterial, infill, color: printColor, quantity: extras.quantity, unitPrice: estimate.price }] : [])];
    if (!designs.length) return;
    if (designs.length > MAX_ORDER_ITEMS) return setOrderState('tooMany');
    const bytes = designs.flatMap((design) => design.parts).reduce((sum, part) => sum + part.file.size, 0) + photos.reduce((sum, photo) => sum + photo.file.size, 0);
    if (bytes > MAX_ORDER_UPLOAD) return setOrderState('tooLarge');
    setOrderState('saving');
    try {
      const form = new FormData();
      form.set('order', JSON.stringify({
        kind: 'custom',
        phone: extras.phone,
        note: extras.note,
        items: designs.map((design) => ({
          material: design.material.id,
          infill: design.infill,
          colorId: design.color.id,
          quantity: design.quantity,
          parts: design.parts.map(({ volumeMm3, dimensionsMm: { x, y, z } }) => ({ volumeMm3, dimensionsMm: { x, y, z } })),
        })),
      }));
      for (const [index, design] of designs.entries()) {
        design.parts.forEach((part) => form.append(`model-${index}`, part.file, part.file.name));
        // A picture of the design, so the order list shows what was ordered without opening the files.
        const preview = await renderModelPreview(design.parts.map((part) => ({ blob: part.file, name: part.file.name })), design.color.hex).catch(() => null);
        if (preview) form.set(`preview-${index}`, preview, preview.name);
      }
      photos.forEach((photo) => form.append('images', photo.file, photo.file.name));
      const response = await fetch('/api/orders', { method: 'POST', body: form });
      const state = response.status === 401 ? 'login' : response.ok ? 'saved' : response.status === 409 ? 'paused' : 'failed';
      if (state === 'saved') setCart([]);
      setOrderState(state);
    } catch {
      setOrderState('failed');
    }
  };
  const orderMessage = {
    idle: '',
    saving: text.orderUploading,
    saved: text.orderConfirmed,
    login: text.loginRequired,
    failed: text.orderFailed,
    paused: pricing.notice || text.ordersPaused,
    tooLarge: text.uploadTooLarge,
    tooMany: text.tooManyDesigns(MAX_ORDER_ITEMS),
  }[orderState];

  return (
    <main className="app-shell">
      <SiteHeader
        language={language}
        text={text}
        onToggleLanguage={toggleLanguage}
      />

      <div className="workspace" id="studio">
        <section className="viewer-card" aria-label={language === 'ar' ? 'مساحة عرض التصميم ثلاثي الأبعاد' : '3D design preview area'}>
          <div className="viewer-header">
            <div><p className="eyebrow" lang="en">LIVE PREVIEW</p><strong dir="auto">{fileTitle}</strong></div>
            <div className="viewer-badges">
              <span className="soft-badge">{parts.length ? [...new Set(parts.map((part) => part.format.toUpperCase()))].join(' · ') : 'STL · OBJ · 3MF'}</span>
              <button className="ghost-button" onClick={() => controlsRef.current?.reset()} disabled={!parts.length}>{text.reset}</button>
            </div>
          </div>

          <div className="viewer-stage" ref={viewerHostRef}>
            {viewerState !== 'ready' && (
              <div className="stage-message" role="status" aria-live="polite">
                <div className="upload-orb"><UploadIcon size={28} /></div>
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
            <h1>{text.heroLine1}<br />{text.heroLine2}</h1>
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
            <input ref={fileInputRef} type="file" accept=".stl,.obj,.3mf" multiple onChange={handleFileChange} />
            <span className="dropzone-icon"><UploadIcon size={18} /></span>
            <span className="dropzone-title">{text.dropTitle}</span>
            <span className="dropzone-subtitle">{text.dropSubtitle}</span>
            <span className="dropzone-formats">STL · OBJ · 3MF <i>{language === 'ar' ? 'حتى 50MB للملف' : 'up to 50MB each'}</i></span>
          </label>

          {parts.length > 0 && (
            <section className="info-section">
              <div className="section-heading"><span>{text.designData}</span><span className="file-chip">{text.partsCount(parts.length)}</span></div>
              <div className="stat-grid">
                <div><span>{text.fileSize}</span><strong>{formatBytes(parts.reduce((sum, part) => sum + part.file.size, 0))}</strong></div>
                <div><span>{text.triangles}</span><strong>{formatNumber(parts.reduce((sum, part) => sum + part.triangleCount, 0), 0)}</strong></div>
              </div>
              <div className="parts-list">
                <span className="parts-list-title">{text.parts} · {text.dimensions} ({unit})</span>
                {parts.map((part) => (
                  <div className="part-row" key={part.key}>
                    <span className="part-name" dir="ltr">{part.file.name}</span>
                    <small dir="ltr">{dims(part)}</small>
                    <button type="button" className="part-remove" onClick={() => removePart(part.key)} aria-label={`${text.removePart}: ${part.file.name}`}>×</button>
                  </div>
                ))}
                {parts.length < MAX_ITEM_PARTS && <button type="button" className="ghost-button part-add" onClick={() => fileInputRef.current?.click()}>{text.addPart}</button>}
                <p className="parts-hint">{text.partsHint}</p>
                {partsFailed && <p className="parts-error" role="alert">{text.partsFailed}</p>}
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
              <label>{text.material}<select value={selectedMaterial.id} onChange={(event) => setMaterialKey(event.target.value)}>{materials.map((material) => <option key={material.id} value={material.id}>{materialName(material)}</option>)}</select></label>
              <label>{text.infill} <output>{infill}%</output><input type="range" min="10" max="100" step="5" value={infill} onChange={(event) => setInfill(Number(event.target.value))} /></label>
              <label className="auto-hours"><span>{text.printHours}</span><output>{estimate ? `${formatNumber(estimate.hours, 2)} ${text.hoursUnit}` : '—'}</output></label>
            </div>
            <div className="color-picker">
              <span>{text.printColor}</span>
              <div className="color-swatches" role="radiogroup" aria-label={text.printColor}>
                {colors.map((color) => (
                  <button
                    key={color.id}
                    className={`color-swatch ${printColor.id === color.id ? 'selected' : ''}`}
                    style={{ backgroundColor: color.hex }}
                    onClick={() => setPrintColor(color)}
                    aria-label={colorName(color)}
                    role="radio"
                    aria-checked={printColor.id === color.id}
                    type="button"
                  />
                ))}
              </div>
            </div>
            {!estimateRequested && (
              <div className="estimate-action">
                <p>{parts.length ? text.calculatePrompt : text.noEstimate}</p>
                <button className="primary-button estimate-button" disabled={!estimate} onClick={() => setEstimateRequested(true)}>{text.calculateCost}</button>
              </div>
            )}
            {estimateRequested && (
              <div className="price-result">
                <span>{cart.length ? text.thisDesign : text.totalCost}</span>
                <strong>{estimate ? <>{formatNumber(cart.length ? estimate.price * extras.quantity : designTotal)} <small>{text.currency}</small></> : '—'}</strong>
                <div className="cost-breakdown">
                  <span>{text.materialCost}<b>{estimate ? money(estimate.materialCost) : '—'}</b></span>
                  <span>{text.machineCost}<b>{estimate ? money(estimate.machineCost) : '—'}</b></span>
                </div>
                <p>{estimate ? text.weightDetails(formatNumber(estimate.weightGrams, 1), formatNumber(selectedMaterial.rate, 0)) : text.noEstimate}</p>
              </div>
            )}
            {(currentIncluded || cart.length > 0) && (
              <div className="estimate-action order-builder">
                {cart.length > 0 && (
                  <div className="cart-list">
                    <span className="cart-title">{text.cartTitle}</span>
                    {cart.map((item) => (
                      <div className="cart-item" key={item.key}>
                        <i className="cart-swatch" style={{ background: item.color.hex }} aria-hidden="true" />
                        <div>
                          <strong dir="auto">{item.parts[0].file.name}</strong>
                          <small>{text.partsCount(item.parts.length)} · {materialName(item.material)} · {colorName(item.color)} · {item.infill}% · × {item.quantity}</small>
                        </div>
                        <b>{money(item.unitPrice * item.quantity)}</b>
                        <button type="button" className="part-remove" onClick={() => setCart(cart.filter((other) => other.key !== item.key))} aria-label={`${text.removeDesign}: ${item.parts[0].file.name}`}>×</button>
                      </div>
                    ))}
                    <div className="cart-total"><span>{text.orderTotal}</span><strong>{money(orderAll)}</strong></div>
                  </div>
                )}
                {(pricing.setupFee > 0 || pricing.minimumPrice > 0) && <p>{[pricing.setupFee > 0 && text.setupFee(formatNumber(pricing.setupFee, 0)), pricing.minimumPrice > 0 && text.minimumPrice(formatNumber(pricing.minimumPrice, 0))].filter(Boolean).join(' · ')}</p>}
                <OrderExtras text={text} value={extras} onChange={setExtras} />
                {currentIncluded && cart.length < MAX_ORDER_ITEMS && (
                  <>
                    <button type="button" className="ghost-button add-design-button" onClick={addDesign} disabled={orderState === 'saving'}>{text.addDesign}</button>
                    <p className="parts-hint">{text.addDesignHint}</p>
                  </>
                )}
                <ImagePicker images={photos} onChange={setPhotos} max={MAX_ORDER_IMAGES} label={text.refPhotos} hint={text.refPhotosHint} text={text.imageText} />
                <p>{text.orderFileNote}</p>
                <button className="primary-button estimate-button" disabled={!pricing.acceptingOrders || !designCount || orderState === 'saving' || orderState === 'saved'} onClick={orderFiles}>{orderState === 'saving' ? text.orderSaving : designCount > 1 ? text.sendOrder(designCount) : text.orderThisFile}</button>
                {orderMessage && <p role="status" className="studio-order-message">{orderMessage}</p>}
              </div>
            )}
            <p className="fine-print">{text.estimateNote} · {text.hourlyRate(formatNumber(pricing.machineHourlyRate, 0))}</p>
          </section>

          <div className="privacy-note"><ShieldIcon size={18} /><p><strong>{text.privacyTitle}</strong><br />{text.privacyBody}</p></div>
        </aside>
      </div>

      <footer className="footer-note"><span>Mojassam 3D / v1</span><span>{text.footer}</span></footer>
    </main>
  );
}
