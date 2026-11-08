'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SiteHeader from '@/components/site-header';
import { CheckIcon, ShieldIcon, UploadIcon } from '@/components/icons';
import { getReadyPrice, orderTotal, publicCatalog, type Pricing, type PrintColor, type ReadyDesign } from '@/lib/catalog';
import OrderExtras, { EMPTY_EXTRAS } from '@/components/order-extras';
import { COPY, type FileErrorKey } from '@/lib/copy';
import { useLanguage } from '@/lib/language';
import { formatBytes, formatNumber, validateModelFile } from '@/lib/model-file';
import { savePendingFile } from '@/lib/pending-file';
import { getFaq, SITE_TITLE_AR } from '@/lib/site';

type OrderState = 'idle' | 'added' | 'saving' | 'saved' | 'login' | 'failed' | 'paused';

export default function Home({ pricing, jsonLd }: { pricing: Pricing; jsonLd: string }) {
  const { materials, colors, designs } = publicCatalog(pricing);
  const FAQ = getFaq(pricing);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { language, toggleLanguage } = useLanguage();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<FileErrorKey | null>(null);
  const [orderDesign, setOrderDesign] = useState<ReadyDesign | null>(null);
  const [orderColor, setOrderColor] = useState<PrintColor>(colors[0]);
  const [extras, setExtras] = useState(EMPTY_EXTRAS);
  const [orderState, setOrderState] = useState<OrderState>('idle');
  const text = COPY[language];
  const name = (design: ReadyDesign) => language === 'ar' ? design.nameAr : design.nameEn;

  useEffect(() => {
    document.title = language === 'ar' ? SITE_TITLE_AR : 'Mojassam 3D — 3D file preview & 3D-printing cost estimate';
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
    if (orderDesign?.id !== design.id) setExtras(EMPTY_EXTRAS);
    setOrderDesign(design);
    setOrderState('idle');
    dialogRef.current?.showModal();
  };

  const confirmReadyOrder = async () => {
    if (!orderDesign) return;
    setOrderState('saving');
    try {
      // Only the choice is sent; the server looks up the price itself.
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'ready', designId: orderDesign.id, colorId: orderColor.id, ...extras }),
      });
      setOrderState(response.status === 401 ? 'login' : response.ok ? 'saved' : response.status === 409 ? 'paused' : 'failed');
    } catch {
      setOrderState('failed');
    }
  };

  const orderNotice = { idle: '', added: '', saving: '', saved: text.orderConfirmed, login: text.loginRequired, failed: text.orderFailed, paused: pricing.notice || text.ordersPaused }[orderState];
  const unitPrice = (design: ReadyDesign) => getReadyPrice(design, pricing);
  const materialLabel = (id: string) => materials.find((material) => material.id === id)?.label ?? id;

  return (
    <main className="home-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      {(pricing.notice || !pricing.acceptingOrders) && <div className="shop-notice" role="status">{pricing.notice || text.ordersPaused}</div>}
      <SiteHeader
        language={language}
        text={text}
        onToggleLanguage={toggleLanguage}
      />

      <section className="home-hero">
        <div className="home-copy">
          <p className="eyebrow accent">{text.start}</p>
          <h1>{text.heroLine1}<br />{text.heroLine2}</h1>
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
          {designs.map((design) => (
            <article className="store-card" key={design.id}>
              {design.images.length ? (
                <div className="product-gallery-wrap">
                  <div className="product-gallery" tabIndex={design.images.length > 1 ? 0 : undefined} aria-label={name(design)}>
                    {design.images.map((src, index) => <img key={src} className="product-image" src={src} alt={index === 0 ? name(design) : ''} loading="lazy" decoding="async" />)}
                  </div>
                  {design.images.length > 1 && <span className="product-gallery-count" dir="ltr">{design.images.length} ◂▸</span>}
                </div>
              ) : <div className={`product-art ${design.artClass}`} aria-hidden="true"><span /></div>}
              <div className="store-card-body">
                <div className="store-card-meta"><span>{language === 'ar' ? design.categoryAr : design.categoryEn}</span><span>{text.readyOrderTag}</span></div>
                <h3>{name(design)}</h3>
                <p>{language === 'ar' ? design.descriptionAr : design.descriptionEn}</p>
                <p className="ready-order-note">{text.readyOrderNote}</p>
                <div className="product-specs"><span>{materialLabel(design.material)}</span><span>{text.infill}: {formatNumber(design.infill, 0)}%</span><span>{formatNumber(design.weightGrams, 0)} {text.gramsUnit}</span><span>{formatNumber(design.printHours, 2)} {text.hoursUnit}</span></div>
                <div className="store-card-footer"><strong>{formatNumber(orderTotal(pricing, unitPrice(design)))} <small>{text.currency}</small></strong><button className="primary-button compact ready-order-button" disabled={!pricing.acceptingOrders} onClick={() => requestReadyDesign(design)}>{text.orderNow}</button></div>
              </div>
            </article>
          ))}
        </div>
        <dialog
          ref={dialogRef}
          className="order-dialog"
          aria-labelledby="order-dialog-title"
          onClose={() => setOrderState('idle')}
          onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
        >
          {orderDesign && (
            <div className="order-dialog-body">
              <header className={`order-dialog-head ${orderDesign.images[0] ? 'has-thumb' : ''}`}>
                {orderDesign.images[0] && <img className="order-dialog-thumb" src={orderDesign.images[0]} alt="" />}
                <div>
                  <p className="eyebrow accent">{text.orderTitle}</p>
                  <h2 id="order-dialog-title">{name(orderDesign)}</h2>
                  <p>{materialLabel(orderDesign.material)} · {text.infill} {formatNumber(orderDesign.infill, 0)}% · {formatNumber(orderDesign.printHours, 2)} {text.hoursUnit}</p>
                </div>
                <button type="button" className="order-dialog-close" onClick={() => dialogRef.current?.close()} aria-label={language === 'ar' ? 'إغلاق' : 'Close'}>×</button>
              </header>

              <div className="color-picker order-color-picker">
                <span>{text.printColor}</span>
                <div className="color-swatches" role="radiogroup" aria-label={text.printColor}>
                  {colors.map((color) => (
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
              <OrderExtras text={text} value={extras} onChange={setExtras} />

              <footer className="order-dialog-foot">
                <div>
                  <span>{text.total}</span>
                  <strong>{formatNumber(orderTotal(pricing, unitPrice(orderDesign), extras.quantity))} <small>{text.currency}</small></strong>
                  <p>{[text.orderNote, pricing.setupFee > 0 && text.setupFee(formatNumber(pricing.setupFee, 0)), pricing.minimumPrice > 0 && text.minimumPrice(formatNumber(pricing.minimumPrice, 0))].filter(Boolean).join(' · ')}</p>
                </div>
                {orderState === 'login'
                  ? <Link className="primary-button" href="/login?next=/%23store">{text.signIn}</Link>
                  : orderState === 'saved'
                    ? <button type="button" className="primary-button" onClick={() => dialogRef.current?.close()}>{language === 'ar' ? 'تمام' : 'Done'}</button>
                    : <button type="button" className="primary-button" disabled={!pricing.acceptingOrders || orderState === 'saving'} onClick={confirmReadyOrder}>{orderState === 'saving' ? text.orderSaving : text.confirmOrder}</button>}
              </footer>
              {orderNotice && <p className={`order-dialog-notice ${orderState === 'failed' || orderState === 'paused' ? 'error' : ''}`} role="status">{orderNotice}</p>}
            </div>
          )}
        </dialog>
      </section>

      <section className="store-section faq-section" id="faq" aria-labelledby="faq-title">
        <div className="store-header">
          <div>
            <p className="eyebrow accent" lang="en">FAQ</p>
            <h2 id="faq-title">{language === 'ar' ? 'أسئلة شائعة عن الطباعة ثلاثية الأبعاد' : '3D printing FAQ'}</h2>
          </div>
        </div>
        <div className="faq-list">
          {FAQ[language].map(({ q, a }) => (
            <details className="faq-item" key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="footer-note"><span>Mojassam 3D / v1</span><span>{text.footer}</span></footer>
    </main>
  );
}
