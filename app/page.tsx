'use client';

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { readPendingFile, savePendingFile } from '../lib/pending-file';

type SupportedFormat = 'stl' | 'obj' | '3mf';
type ViewerState = 'idle' | 'loading' | 'ready' | 'error';
type MaterialKey = 'pla' | 'petg';
type UnitKey = 'mm' | 'cm' | 'in';
type LanguageKey = 'ar' | 'en';
type PrintColor = { id: string; ar: string; en: string; hex: string };
type ReadyDesign = {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  categoryAr: string;
  categoryEn: string;
  material: MaterialKey;
  infill: number;
  weightGrams: number;
  printHours: number;
  artClass: string;
  image?: string;
};

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
  colorToken: string;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MATERIALS: Record<MaterialKey, PricingConfig> = {
  pla: { density: 1.24, rate: 6, label: 'PLA', colorToken: '--color-brand' },
  petg: { density: 1.27, rate: 8, label: 'PETG', colorToken: '--color-info' },
};
const UNIT_FACTORS: Record<UnitKey, number> = { mm: 1, cm: 0.1, in: 1 / 25.4 };
const UNIT_LABELS: Record<UnitKey, string> = { mm: 'mm', cm: 'cm', in: 'in' };
const MACHINE_HOURLY_RATE = 15;
const PRINT_COLORS: PrintColor[] = [
  { id: 'lime', ar: 'ليموني', en: 'Lime', hex: '#b5f23d' },
  { id: 'black', ar: 'أسود', en: 'Black', hex: '#171b28' },
  { id: 'white', ar: 'أبيض', en: 'White', hex: '#f4f6f0' },
  { id: 'blue', ar: 'أزرق', en: 'Blue', hex: '#5ba7ff' },
  { id: 'orange', ar: 'برتقالي', en: 'Orange', hex: '#f59b5b' },
  { id: 'pink', ar: 'وردي', en: 'Pink', hex: '#ef8fb5' },
];
const READY_DESIGNS: ReadyDesign[] = [
  { id: 'desk-organizer', nameAr: 'منظّم مكتب', nameEn: 'Desk organizer', descriptionAr: 'خانات عملية للأقلام والكروت.', descriptionEn: 'Practical slots for pens and cards.', categoryAr: 'مكتب', categoryEn: 'Desk', material: 'pla', infill: 20, weightGrams: 72, printHours: 2.5, artClass: 'organizer' },
  { id: 'wave-vase', nameAr: 'مزهرية الموجة', nameEn: 'Wave vase', descriptionAr: 'شكل هادئ يضيف لمسة للمكان.', descriptionEn: 'A calm form that adds character to a room.', categoryAr: 'ديكور', categoryEn: 'Decor', material: 'petg', infill: 15, weightGrams: 118, printHours: 4, artClass: 'vase' },
  { id: 'phone-stand', nameAr: 'حامل موبايل', nameEn: 'Phone stand', descriptionAr: 'حامل ثابت للمكتب أو بجانب السرير.', descriptionEn: 'A stable stand for your desk or bedside.', categoryAr: 'إكسسوارات', categoryEn: 'Accessories', material: 'pla', infill: 25, weightGrams: 54, printHours: 1.75, artClass: 'stand' },
];
const COPY = {
  ar: {
    language: 'English',
    account: 'تسجيل الدخول',
    home: 'الرئيسية',
    studioNav: 'المعاينة والتسعير',
    storeNav: 'التصميمات الجاهزة',
    privacyStatus: 'الملف يفضل على جهازك',
    upload: '+ رفع ملف',
    noFile: 'لم يتم اختيار تصميم بعد',
    reset: 'إعادة ضبط العرض',
    loadingTitle: 'بنجهز المعاينة…',
    idleTitle: 'ارفع تصميمك وابدأ',
    loadingBody: 'ثواني ونظهر المجسم هنا.',
    idleBody: 'اسحب ملفك هنا أو استخدم زر الرفع.',
    fileLimit: 'STL · OBJ · 3MF / حتى 50MB',
    stageHint: 'اسحب للتدوير · عجلة الماوس للتكبير · زر يمين للتحريك',
    autoRotate: '◌ دوران تلقائي',
    grid: '▦ الشبكة',
    localSafe: 'تجربة محلية وآمنة',
    start: 'ابدأ من هنا',
    heroLine1: 'شوف تصميمك',
    heroLine2: 'قبل ما تطبعه.',
    intro: 'عاين التفاصيل، افهم الحجم، وخد فكرة عن التكلفة في مساحة واحدة.',
    dropTitle: 'اسحب الملف هنا',
    dropSubtitle: 'أو اضغط لاختيار ملف من جهازك',
    designData: 'بيانات التصميم',
    fileSize: 'الحجم',
    triangles: 'المثلثات',
    dimensions: 'الأبعاد',
    unit: 'وحدة القياس',
    mm: 'ميليمتر (mm)',
    cm: 'سنتيمتر (cm)',
    inches: 'بوصة (in)',
    estimate: 'تقدير التكلفة',
    preliminary: 'مبدئي',
    material: 'الخامة',
    pla: 'PLA · عملي وخفيف',
    petg: 'PETG · أقوى ومتين',
    infill: 'الامتلاء',
    printColor: 'لون الطباعة',
    printHours: 'التشغيل المتوقع',
    autoCalculated: 'محسوبة تلقائيًا',
    hourlyRate: (rate: string) => `${rate} ج.م / ساعة`,
    materialCost: 'الخامة',
    machineCost: 'تشغيل المكنة',
    totalCost: 'التكلفة الإجمالية',
    approxPrice: 'السعر التقريبي',
    weightDetails: (weight: string, rate: string) => `وزن متوقع ${weight} جم · سعر ${rate} ج.م/جم`,
    noEstimate: 'ارفع ملفًا مغلقًا وقابلًا للحساب لإظهار التقدير',
    estimateNote: 'الساعات تقديرية من الحجم والامتلاء فقط؛ الحساب الدقيق يحتاج Slicer.',
    privacyTitle: 'خصوصيتك أولًا',
    privacyBody: 'الملف لا يغادر جهازك ولا يتم حفظه على أي سيرفر.',
    footer: 'مصمم للمعاينة السريعة قبل الطباعة',
    unsupported: 'الصيغة غير مدعومة. ارفع STL أو OBJ أو 3MF.',
    tooLarge: 'الملف أكبر من 50MB. جرّب تصدير نسخة أخف.',
    parseError: 'لم نقدر نقرأ الملف. تأكد أنه ملف 3D سليم ثم جرّب مرة ثانية.',
    fileClosed: 'ارفع ملفًا مغلقًا وقابلًا للحساب لإظهار التقدير',
    storeTitle: 'تصميمات جاهزة للطباعة',
    storeIntro: 'اختار قطعة جاهزة، شوف تكلفتها، وأضفها لطلبك في خطوة واحدة.',
    readyTag: 'جاهز للطباعة',
    addToOrder: 'أضف للطلب',
    orderTitle: 'طلبك المبدئي',
    orderEmpty: 'لم تختار تصميمًا بعد.',
    orderAdded: 'تمت إضافة التصميم للطلب المبدئي.',
    orderNote: 'الطلب مبدئي — نؤكد التفاصيل والتسليم قبل التنفيذ.',
    confirmOrder: 'تأكيد الطلب المبدئي',
    calculateCost: 'احسب التكلفة',
    calculatePrompt: 'راجع الإعدادات ثم احسب التكلفة التقديرية.',
    homeUploadTitle: 'ارفع ملفك وابدأ من هنا',
    homeUploadBody: 'اختار ملف STL أو OBJ أو 3MF، وبعدها افتح الاستوديو لمعاينة المجسم وحساب التكلفة.',
    selectedFile: 'الملف جاهز للاستوديو',
    openStudio: 'افتح الاستوديو واحسب التكلفة',
    browseDesigns: 'تصفح التصميمات الجاهزة',
    orderConfirmed: 'تم تسجيل طلبك المبدئي. سنتواصل لتأكيد التفاصيل.',
    loginRequired: 'سجّل دخولك أولًا لحفظ الطلب في سجل حسابك.',
    orderSaving: 'جارٍ حفظ الطلب…',
    orderFailed: 'تعذر حفظ الطلب الآن. حاول مرة أخرى.',
  },
  en: {
    language: 'العربية',
    account: 'Sign in',
    home: 'Home',
    studioNav: 'Preview & pricing',
    storeNav: 'Ready designs',
    privacyStatus: 'Your file stays on your device',
    upload: '+ Upload file',
    noFile: 'No design selected yet',
    reset: 'Reset view',
    loadingTitle: 'Preparing preview…',
    idleTitle: 'Upload your design',
    loadingBody: 'We will show the model here in a moment.',
    idleBody: 'Drop your file here or use the upload button.',
    fileLimit: 'STL · OBJ · 3MF / up to 50MB',
    stageHint: 'Drag to orbit · scroll to zoom · right-click to pan',
    autoRotate: '◌ Auto-rotate',
    grid: '▦ Grid',
    localSafe: 'Private and local',
    start: 'Start here',
    heroLine1: 'See your design',
    heroLine2: 'before you print it.',
    intro: 'Inspect details, understand the size, and get a quick cost estimate in one place.',
    dropTitle: 'Drop your file here',
    dropSubtitle: 'or click to choose a file from your device',
    designData: 'Design data',
    fileSize: 'File size',
    triangles: 'Triangles',
    dimensions: 'Dimensions',
    unit: 'Measurement unit',
    mm: 'Millimeters (mm)',
    cm: 'Centimeters (cm)',
    inches: 'Inches (in)',
    estimate: 'Cost estimate',
    preliminary: 'Preliminary',
    material: 'Material',
    pla: 'PLA · practical and light',
    petg: 'PETG · stronger and durable',
    infill: 'Infill',
    printColor: 'Print color',
    printHours: 'Estimated run time',
    autoCalculated: 'Calculated automatically',
    hourlyRate: (rate: string) => `${rate} EGP / hour`,
    materialCost: 'Material',
    machineCost: 'Machine time',
    totalCost: 'Total cost',
    approxPrice: 'Estimated price',
    weightDetails: (weight: string, rate: string) => `Expected weight ${weight} g · Rate ${rate} EGP/g`,
    noEstimate: 'Upload a closed, measurable file to show an estimate',
    estimateNote: 'Hours are estimated from volume and infill; exact timing needs a slicer.',
    privacyTitle: 'Privacy first',
    privacyBody: 'Your file never leaves your device or gets saved to a server.',
    footer: 'Built for quick checks before printing',
    unsupported: 'Unsupported format. Upload an STL, OBJ, or 3MF file.',
    tooLarge: 'The file is larger than 50MB. Try exporting a lighter version.',
    parseError: 'We could not read this file. Make sure it is a valid 3D file and try again.',
    fileClosed: 'Upload a closed, measurable file to show an estimate',
    storeTitle: 'Ready-to-print designs',
    storeIntro: 'Choose a ready piece, see its cost, and add it to your request in one step.',
    readyTag: 'Ready to print',
    addToOrder: 'Add to request',
    orderTitle: 'Your preliminary request',
    orderEmpty: 'No design selected yet.',
    orderAdded: 'Design added to your preliminary request.',
    orderNote: 'Preliminary request — we confirm details and delivery before production.',
    confirmOrder: 'Confirm preliminary request',
    calculateCost: 'Calculate cost',
    calculatePrompt: 'Review the settings, then calculate the preliminary cost.',
    homeUploadTitle: 'Upload your file to get started',
    homeUploadBody: 'Choose an STL, OBJ, or 3MF file, then open the studio to inspect the model and calculate its cost.',
    selectedFile: 'File ready for the studio',
    openStudio: 'Open studio and calculate cost',
    browseDesigns: 'Browse ready designs',
    orderConfirmed: 'Your preliminary request is saved. We will contact you to confirm details.',
    loginRequired: 'Sign in first to save this request to your account history.',
    orderSaving: 'Saving request…',
    orderFailed: 'Could not save the request. Try again.',
  },
} as const;

function getThemeColor(token: string) {
  if (typeof document === 'undefined') return '#ffffff';
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#ffffff';
}

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
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
}

function getReadyPrice(design: ReadyDesign) {
  return design.weightGrams * MATERIALS[design.material].rate + design.printHours * MACHINE_HOURLY_RATE;
}

function estimateMachineHours(volumeCm3: number, dimensionsMm: THREE.Vector3, infill: number) {
  const largestDimension = Math.max(dimensionsMm.x, dimensionsMm.y, dimensionsMm.z);
  const sizeFactor = Math.max(1, largestDimension / 100);
  const infillFactor = 0.7 + infill / 100;
  return Math.max(0.25, 0.25 + (volumeCm3 / 14) * sizeFactor * infillFactor);
}

function parseModel(file: File, format: SupportedFormat) {
  return file.arrayBuffer().then((data) => {
    if (format === 'stl') {
      const geometry = new STLLoader().parse(data);
      geometry.computeVertexNormals();
      return new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: getThemeColor(MATERIALS.pla.colorToken), roughness: 0.68, metalness: 0.05 }),
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

export function StudioPage() {
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
  const [language, setLanguage] = useState<LanguageKey>('ar');
  const [materialKey, setMaterialKey] = useState<MaterialKey>('pla');
  const [unit, setUnit] = useState<UnitKey>('mm');
  const [infill, setInfill] = useState(20);
  const [printColor, setPrintColor] = useState<PrintColor>(PRINT_COLORS[0]);
  const [orderDesign, setOrderDesign] = useState<ReadyDesign | null>(null);
  const [orderNotice, setOrderNotice] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [gridVisible, setGridVisible] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [modelColor, setModelColor] = useState(() => getThemeColor(MATERIALS.pla.colorToken));
  const [estimateRequested, setEstimateRequested] = useState(false);
  const text = COPY[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.title = language === 'ar' ? '3D Preview — عاين تصميمك قبل الطباعة' : '3D Preview — Preview before you print';
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
    grid.position.y = 0;
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
    if (modelRef.current) applyModelStyle(modelRef.current, modelColor);
  }, [modelColor]);

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
    const modelCenter = box.getCenter(new THREE.Vector3());
    controls.target.copy(modelCenter);
    controls.saveState();
    if (gridRef.current) gridRef.current.scale.setScalar(Math.max(1, maxSize / 70));
  };

  const loadFile = async (file: File) => {
    const format = getFormat(file.name);
    if (!format) {
      setViewerState('error');
      setError(text.unsupported);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setViewerState('error');
      setError(text.tooLarge);
      return;
    }

    setViewerState('loading');
    setError('');
    setEstimateRequested(false);
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
      applyModelStyle(model, modelColor);
      setMetadata({ fileName: file.name, fileSize: file.size, format, dimensionsMm, volumeMm3, triangleCount });
      setViewerState('ready');
      requestAnimationFrame(fitModel);
    } catch {
      setViewerState('error');
      setError(text.parseError);
    }
  };

  useEffect(() => {
    void readPendingFile().then((file) => {
      if (file) void loadFile(file);
    }).catch(() => undefined);
  }, []);

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
  const materialCost = estimatedWeight ? estimatedWeight * selectedMaterial.rate : null;
  const estimatedMachineHours = volumeCm3 && metadata?.dimensionsMm ? estimateMachineHours(volumeCm3, metadata.dimensionsMm, infill) : null;
  const machineCost = estimatedMachineHours ? estimatedMachineHours * MACHINE_HOURLY_RATE : null;
  const estimatedPrice = materialCost !== null && machineCost !== null ? materialCost + machineCost : null;

  const confirmReadyOrder = async () => {
    if (!orderDesign) return;
    setOrderSubmitting(true);
    setOrderNotice(text.orderSaving);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designId: orderDesign.id,
          designName: language === 'ar' ? orderDesign.nameAr : orderDesign.nameEn,
          material: MATERIALS[orderDesign.material].label,
          color: language === 'ar' ? printColor.ar : printColor.en,
          infill: orderDesign.infill,
          estimatedHours: orderDesign.printHours,
          estimatedPrice: getReadyPrice(orderDesign),
        }),
      });
      if (response.status === 401) {
        setOrderNotice(text.loginRequired);
        return;
      }
      if (!response.ok) throw new Error('order failed');
      setOrderNotice(text.orderConfirmed);
    } catch {
      setOrderNotice(text.orderFailed);
    } finally {
      setOrderSubmitting(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">◎</div>
          <div><p className="eyebrow">3D WORKSPACE</p><h1>3D Preview</h1></div>
        </div>
        <nav className="topbar-nav" aria-label={language === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}>
          <a href="/">{text.home}</a>
          <a href="#studio">{text.studioNav}</a>
          <a href="/#store">{text.storeNav}</a>
        </nav>
        <div className="topbar-note"><span className="online-dot" /> {text.privacyStatus}</div>
        <div className="topbar-actions">
          <a className="ghost-button account-link" href="/account">{text.account}</a>
          <button className="ghost-button language-button" onClick={() => setLanguage((value) => value === 'ar' ? 'en' : 'ar')} aria-label={text.language}>{text.language}</button>
          <button className="primary-button compact" onClick={() => fileInputRef.current?.click()}>{text.upload}</button>
        </div>
      </header>

      <div className="workspace" id="studio">
        <section className="viewer-card" aria-label={language === 'ar' ? 'مساحة عرض التصميم ثلاثي الأبعاد' : '3D design preview area'}>
          <div className="viewer-header">
            <div><p className="eyebrow">LIVE PREVIEW</p><strong>{metadata?.fileName ?? text.noFile}</strong></div>
            <div className="viewer-badges">
              <span className="soft-badge">{metadata ? metadata.format.toUpperCase() : 'STL · OBJ · 3MF'}</span>
              <button className="ghost-button" onClick={resetCamera} disabled={!metadata}>{text.reset}</button>
            </div>
          </div>

          <div className="viewer-stage" ref={viewerHostRef}>
            {viewerState !== 'ready' && (
              <div className="stage-message" role="status" aria-live="polite">
                <div className="upload-orb">↥</div>
                <h2>{viewerState === 'loading' ? text.loadingTitle : text.idleTitle}</h2>
                <p>{viewerState === 'loading' ? text.loadingBody : text.idleBody}</p>
                {viewerState === 'idle' && <span className="format-note">{text.fileLimit}</span>}
                {viewerState === 'error' && <div className="error-message">{error}</div>}
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
                <div className="wide-stat"><span>{text.dimensions} ({UNIT_LABELS[unit]})</span><strong>{dimensions}</strong></div>
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
              <label className="auto-hours"><span>{text.printHours}</span><output>{estimatedMachineHours ? `${formatNumber(estimatedMachineHours, 2)} ${language === 'ar' ? 'ساعة' : 'h'}` : '—'}</output></label>
            </div>
            <div className="color-picker">
              <span>{text.printColor}</span>
              <div className="color-swatches" role="radiogroup" aria-label={text.printColor}>
                {PRINT_COLORS.map((color) => (
                  <button
                    key={color.id}
                    className={`color-swatch ${printColor.id === color.id ? 'selected' : ''}`}
                    style={{ backgroundColor: color.hex }}
                    onClick={() => { setPrintColor(color); setModelColor(color.hex); }}
                    aria-label={language === 'ar' ? color.ar : color.en}
                    aria-pressed={printColor.id === color.id}
                    type="button"
                  />
                ))}
              </div>
            </div>
            {!estimateRequested && (
              <div className="estimate-action">
                <p>{metadata ? text.calculatePrompt : text.noEstimate}</p>
                <button className="primary-button estimate-button" disabled={!metadata || estimatedPrice === null} onClick={() => setEstimateRequested(true)}>{text.calculateCost}</button>
              </div>
            )}
            {estimateRequested && (
              <div className="price-result">
                <span>{text.totalCost}</span>
                <strong>{estimatedPrice !== null ? <>{formatNumber(estimatedPrice)} <small>{language === 'ar' ? 'ج.م' : 'EGP'}</small></> : '—'}</strong>
                <div className="cost-breakdown">
                  <span>{text.materialCost}<b>{materialCost ? `${formatNumber(materialCost)} ${language === 'ar' ? 'ج.م' : 'EGP'}` : '—'}</b></span>
                  <span>{text.machineCost}<b>{machineCost ? `${formatNumber(machineCost)} ${language === 'ar' ? 'ج.م' : 'EGP'}` : '—'}</b></span>
                </div>
                <p>{estimatedWeight ? text.weightDetails(formatNumber(estimatedWeight, 1), formatNumber(selectedMaterial.rate, 0)) : text.noEstimate}</p>
              </div>
            )}
            <p className="fine-print">{text.estimateNote} · {text.hourlyRate(formatNumber(MACHINE_HOURLY_RATE, 0))}</p>
          </section>

          <div className="privacy-note"><span>◉</span><p><strong>{text.privacyTitle}</strong><br />{text.privacyBody}</p></div>
        </aside>
      </div>

      <section className="store-section" id="store" aria-labelledby="store-title">
        <div className="store-header">
          <div>
            <p className="eyebrow accent">{text.storeNav}</p>
            <h2 id="store-title">{text.storeTitle}</h2>
            <p>{text.storeIntro}</p>
          </div>
          <span className="store-rate">{text.hourlyRate(formatNumber(MACHINE_HOURLY_RATE, 0))}</span>
        </div>
        <div className="store-grid">
          {READY_DESIGNS.map((design) => (
            <article className="store-card" key={design.id}>
              {design.image ? <img className="product-image" src={design.image} alt={language === 'ar' ? design.nameAr : design.nameEn} /> : <div className={`product-art ${design.artClass}`} aria-hidden="true"><span /></div>}
              <div className="store-card-body">
                <div className="store-card-meta"><span>{language === 'ar' ? design.categoryAr : design.categoryEn}</span><span>{text.readyTag}</span></div>
                <h3>{language === 'ar' ? design.nameAr : design.nameEn}</h3>
                <p>{language === 'ar' ? design.descriptionAr : design.descriptionEn}</p>
                <div className="product-specs"><span>{MATERIALS[design.material].label}</span><span>{text.infill}: {formatNumber(design.infill, 0)}%</span><span>{formatNumber(design.weightGrams, 0)} {language === 'ar' ? 'جم' : 'g'}</span><span>{formatNumber(design.printHours, 2)} {language === 'ar' ? 'ساعة' : 'h'}</span></div>
                <div className="store-card-footer"><strong>{formatNumber(getReadyPrice(design))} <small>{language === 'ar' ? 'ج.م' : 'EGP'}</small></strong><button className="tool-button" onClick={() => { setOrderDesign(design); setOrderNotice(text.orderAdded); }}>{text.addToOrder}</button></div>
              </div>
            </article>
          ))}
        </div>
        <section className="order-summary" id="order-summary" aria-live="polite">
          <div>
            <p className="eyebrow accent">{text.orderTitle}</p>
            <strong>{orderDesign ? (language === 'ar' ? orderDesign.nameAr : orderDesign.nameEn) : text.orderEmpty}</strong>
            {orderDesign && <p>{formatNumber(getReadyPrice(orderDesign))} {language === 'ar' ? 'ج.م' : 'EGP'} · {text.orderNote}</p>}
          </div>
          <button className="primary-button" disabled={!orderDesign || orderSubmitting} onClick={confirmReadyOrder}>{orderSubmitting ? text.orderSaving : text.confirmOrder}</button>
          {orderNotice && <span className="order-notice">{orderNotice}</span>}
        </section>
      </section>

      <footer className="footer-note"><span>3D Preview / v1</span><span>{text.footer}</span></footer>
    </main>
  );
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [language, setLanguage] = useState<LanguageKey>('ar');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const text = COPY[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.title = language === 'ar' ? '3D Preview — ابدأ طباعتك' : '3D Preview — Start your print';
  }, [language]);

  const chooseFile = async (file?: File) => {
    if (!file) return;
    if (!getFormat(file.name)) {
      setFileError(text.unsupported);
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError(text.tooLarge);
      setSelectedFile(null);
      return;
    }
    try {
      await savePendingFile(file);
      setSelectedFile(file);
      setFileError('');
    } catch {
      setFileError(text.parseError);
    }
  };

  return (
    <main className="home-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">◎</div>
          <div><p className="eyebrow">3D WORKSPACE</p><h1>3D Preview</h1></div>
        </div>
        <nav className="topbar-nav" aria-label={language === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}>
          <a href="/studio">{text.studioNav}</a>
          <a href="#store">{text.storeNav}</a>
        </nav>
        <div className="topbar-note"><span className="online-dot" /> {text.privacyStatus}</div>
        <div className="topbar-actions">
          <a className="ghost-button account-link" href="/account">{text.account}</a>
          <button className="ghost-button language-button" onClick={() => setLanguage((value) => value === 'ar' ? 'en' : 'ar')} aria-label={text.language}>{text.language}</button>
        </div>
      </header>

      <section className="home-hero">
        <div className="home-copy">
          <p className="eyebrow accent">{text.start}</p>
          <h2>{text.heroLine1}<br />{text.heroLine2}</h2>
          <p>{text.intro}</p>
          <div className="home-proof"><span>01</span><span>{text.homeUploadBody}</span></div>
        </div>
        <div className="home-upload-card">
          <div className="upload-card-heading">
            <div><p className="eyebrow">STUDIO ENTRY</p><h2>{text.homeUploadTitle}</h2></div>
            <span className="upload-card-mark">↥</span>
          </div>
          <p className="home-upload-body">{text.homeUploadBody}</p>
          <label
            className={`home-dropzone ${selectedFile ? 'has-file' : ''}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); void chooseFile(event.dataTransfer.files?.[0]); }}
          >
            <input ref={fileInputRef} type="file" accept=".stl,.obj,.3mf" onChange={(event) => void chooseFile(event.target.files?.[0])} />
            <span className="home-dropzone-icon">{selectedFile ? '✓' : '↥'}</span>
            <strong>{selectedFile ? selectedFile.name : text.dropTitle}</strong>
            <span>{selectedFile ? `${formatBytes(selectedFile.size)} · ${text.selectedFile}` : text.dropSubtitle}</span>
            <small>STL · OBJ · 3MF <i>{language === 'ar' ? 'حتى 50MB' : 'up to 50MB'}</i></small>
          </label>
          {fileError && <p className="home-file-error" role="alert">{fileError}</p>}
          <button className="primary-button home-upload-action" disabled={!selectedFile} onClick={() => { window.location.href = '/studio'; }}>{text.openStudio}</button>
          <p className="home-local-note"><span>◉</span>{text.privacyBody}</p>
        </div>
      </section>

      <section className="store-section home-store" id="store" aria-labelledby="store-title">
        <div className="store-header">
          <div>
            <p className="eyebrow accent">{text.storeNav}</p>
            <h2 id="store-title">{text.storeTitle}</h2>
            <p>{text.storeIntro}</p>
          </div>
          <a className="store-rate" href="/studio">{text.browseDesigns}</a>
        </div>
        <div className="store-grid">
          {READY_DESIGNS.map((design) => (
            <article className="store-card" key={design.id}>
              {design.image ? <img className="product-image" src={design.image} alt={language === 'ar' ? design.nameAr : design.nameEn} /> : <div className={`product-art ${design.artClass}`} aria-hidden="true"><span /></div>}
              <div className="store-card-body">
                <div className="store-card-meta"><span>{language === 'ar' ? design.categoryAr : design.categoryEn}</span><span>{text.readyTag}</span></div>
                <h3>{language === 'ar' ? design.nameAr : design.nameEn}</h3>
                <p>{language === 'ar' ? design.descriptionAr : design.descriptionEn}</p>
                <div className="product-specs"><span>{MATERIALS[design.material].label}</span><span>{text.infill}: {formatNumber(design.infill, 0)}%</span><span>{formatNumber(design.weightGrams, 0)} {language === 'ar' ? 'جم' : 'g'}</span></div>
                <div className="store-card-footer"><strong>{formatNumber(getReadyPrice(design))} <small>{language === 'ar' ? 'ج.م' : 'EGP'}</small></strong><a className="tool-button" href="/studio">{text.openStudio}</a></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="footer-note"><span>3D Preview / v1</span><span>{text.footer}</span></footer>
    </main>
  );
}
