'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import SiteHeader from '@/components/site-header';
import { CheckIcon, ShieldIcon, UploadIcon } from '@/components/icons';
import { getReadyPrice, MATERIALS, PRINT_COLORS, READY_DESIGNS, type PrintColor, type ReadyDesign } from '@/lib/catalog';
import { COPY, type FileErrorKey } from '@/lib/copy';
import { useLanguage } from '@/lib/language';
import { formatBytes, formatNumber, validateModelFile } from '@/lib/model-file';
import { savePendingFile } from '@/lib/pending-file';

type OrderState = 'idle' | 'added' | 'saving' | 'saved' | 'login' | 'failed';

export default function Home() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { language, toggleLanguage } = useLanguage();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<FileErrorKey | null>(null);
  const [orderDesign, setOrderDesign] = useState<ReadyDesign | null>(null);
  const [orderColor, setOrderColor] = useState<PrintColor>(PRINT_COLORS[0]);
  const [orderState, setOrderState] = useState<OrderState>('idle');
  const text = COPY[language];
  const name = (design: ReadyDesign) => language === 'ar' ? design.nameAr : design.nameEn;

  useEffect(() => {
    document.title = language === 'ar' ? 'Mojassam 3D — ابدأ طباعتك' : 'Mojassam 3D — Start your print';
  }, [language]);

  const chooseFile = async (file?: File) => {
    if (!file) return;
    const problem = validateModelFile(file);
    if (problem) {
      setFileError(problem);
      setSelectedFile(null);
      return;
    }
    try {
      await savePendingFile(file);
      setSelectedFile(file);
      setFileError(null);
    } catch {
      setFileError('parseError');
    }
  };

  const requestReadyDesign = (design: ReadyDesign) => {
    setOrderDesign(design);
    setOrderState('added');
    requestAnimationFrame(() => document.getElementById('order-summary')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const confirmReadyOrder = async () => {
    if (!orderDesign) return;
    setOrderState('saving');
    try {
      // Only the choice is sent; the server looks up the price itself.
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'ready', designId: orderDesign.id, colorId: orderColor.id }),
      });
      setOrderState(response.status === 401 ? 'login' : response.ok ? 'saved' : 'failed');
    } catch {
      setOrderState('failed');
    }
  };

  const orderNotice = { idle: '', added: text.orderAdded, saving: text.orderSaving, saved: text.orderConfirmed, login: text.loginRequired, failed: text.orderFailed }[orderState];

  return (
    <main className="home-shell">
      <SiteHeader
        language={language}
        text={text}
        onToggleLanguage={toggleLanguage}
        onUpload={() => fileInputRef.current?.click()}
      />

      <section className="home-hero">
        <div className="home-copy">
          <p className="eyebrow accent">{text.start}</p>
          <h2>{text.heroLine1}<br />{text.heroLine2}</h2>
          <p>{text.intro}</p>
        </div>
        <div className="home-upload-card">
          <div className="upload-card-heading">
            <div><p className="eyebrow" lang="en">STUDIO ENTRY</p><h2>{text.homeUploadTitle}</h2></div>
            <span className="upload-card-mark"><UploadIcon size={22} /></span>
          </div>
          <p className="home-upload-body">{text.homeUploadBody}</p>
          <label
            className={`home-dropzone ${selectedFile ? 'has-file' : ''}`}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); void chooseFile(event.dataTransfer.files?.[0]); }}
          >
            <input ref={fileInputRef} type="file" accept=".stl,.obj,.3mf" onChange={(event) => void chooseFile(event.target.files?.[0])} />
            <span className="home-dropzone-icon">{selectedFile ? <CheckIcon size={26} /> : <UploadIcon size={26} />}</span>
            <strong>{selectedFile ? selectedFile.name : text.dropTitle}</strong>
            <span>{selectedFile ? `${formatBytes(selectedFile.size)} · ${text.selectedFile}` : text.dropSubtitle}</span>
            <small>STL · OBJ · 3MF <i>{language === 'ar' ? 'حتى 50MB' : 'up to 50MB'}</i></small>
          </label>
          {fileError && <p className="home-file-error" role="alert">{text[fileError]}</p>}
          <button className="primary-button home-upload-action" disabled={!selectedFile} onClick={() => router.push('/studio')}>{text.openStudio}</button>
          <p className="home-local-note"><ShieldIcon size={16} />{text.privacyBody}</p>
        </div>
      </section>

      <section className="store-section home-store" id="store" aria-labelledby="store-title">
        <div className="store-header">
          <div>
            <p className="eyebrow accent">{text.storeNav}</p>
            <h2 id="store-title">{text.storeTitle}</h2>
            <p>{text.storeIntro}</p>
          </div>
          <span className="store-rate">{text.browseDesigns}</span>
        </div>
        <div className="store-grid">
          {READY_DESIGNS.map((design) => (
            <article className="store-card" key={design.id}>
              {design.image ? <img className="product-image" src={design.image} alt={name(design)} /> : <div className={`product-art ${design.artClass}`} aria-hidden="true"><span /></div>}
              <div className="store-card-body">
                <div className="store-card-meta"><span>{language === 'ar' ? design.categoryAr : design.categoryEn}</span><span>{text.readyOrderTag}</span></div>
                <h3>{name(design)}</h3>
                <p>{language === 'ar' ? design.descriptionAr : design.descriptionEn}</p>
                <p className="ready-order-note">{text.readyOrderNote}</p>
                <div className="product-specs"><span>{MATERIALS[design.material].label}</span><span>{text.infill}: {formatNumber(design.infill, 0)}%</span><span>{formatNumber(design.weightGrams, 0)} {text.gramsUnit}</span><span>{formatNumber(design.printHours, 2)} {text.hoursUnit}</span></div>
                <div className="store-card-footer"><strong>{formatNumber(getReadyPrice(design))} <small>{text.currency}</small></strong><button className="primary-button compact ready-order-button" onClick={() => requestReadyDesign(design)}>{text.orderNow}</button></div>
              </div>
            </article>
          ))}
        </div>
        <section className="order-summary" id="order-summary" aria-live="polite">
          <div>
            <p className="eyebrow accent">{text.orderTitle}</p>
            <strong>{orderDesign ? name(orderDesign) : text.orderEmpty}</strong>
            {orderDesign && <p>{formatNumber(getReadyPrice(orderDesign))} {text.currency} · {text.orderNote}</p>}
            {orderDesign && (
              <div className="color-picker order-color-picker">
                <span>{text.printColor}</span>
                <div className="color-swatches" role="radiogroup" aria-label={text.printColor}>
                  {PRINT_COLORS.map((color) => (
                    <button
                      key={color.id}
                      className={`color-swatch ${orderColor.id === color.id ? 'selected' : ''}`}
                      style={{ backgroundColor: color.hex }}
                      onClick={() => setOrderColor(color)}
                      aria-label={language === 'ar' ? color.ar : color.en}
                      role="radio"
                      aria-checked={orderColor.id === color.id}
                      type="button"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <button className="primary-button" disabled={!orderDesign || orderState === 'saving' || orderState === 'saved'} onClick={confirmReadyOrder}>{orderState === 'saving' ? text.orderSaving : text.confirmOrder}</button>
          {orderNotice && <span className="order-notice">{orderNotice}</span>}
        </section>
      </section>

      <footer className="footer-note"><span>Mojassam 3D / v1</span><span>{text.footer}</span></footer>
    </main>
  );
}
