'use client';

import { useEffect, useRef, useState } from 'react';
import { renderModelPreview } from '@/lib/model-preview';
import type { OrderFile } from '@/lib/uploads';

/**
 * `files` are one design's files (its parts and preview). `linked` opens the saved preview full size;
 * leave it off where the thumbnail sits inside a button. `small` is for lists of designs.
 */
type Props = { orderId: string; files: OrderFile[]; color?: string; image?: string; label: string; linked?: boolean; small?: boolean };

/**
 * A picture of what was ordered: the preview saved with the order, the product photo of a ready design,
 * or, for older orders that have only the model, a picture drawn from the model when the card scrolls into view.
 */
export default function OrderThumb({ orderId, files, color = '#9aa4b2', image, label, linked = false, small = false }: Props) {
  const fileUrl = (id: string) => `/api/orders/${orderId}/files/${id}`;
  const preview = files.find((file) => file.kind === 'preview');
  const models = files.filter((file) => file.kind === 'model');
  const modelKey = models.map((file) => file.id).join(',');
  const ref = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [broken, setBroken] = useState(false);
  const needsDrawing = !preview && !image && models.length > 0;

  useEffect(() => {
    const host = ref.current;
    if (!needsDrawing || !host) return;
    let cancelled = false;
    let url = '';
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      try {
        const sources = await Promise.all(models.map(async (model) => {
          const response = await fetch(fileUrl(model.id));
          if (!response.ok) throw new Error('Download failed');
          return { blob: await response.blob(), name: model.name };
        }));
        const picture = await renderModelPreview(sources, color);
        if (cancelled) return;
        url = URL.createObjectURL(picture);
        setDrawn(url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, { rootMargin: '200px' });
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
      if (url) URL.revokeObjectURL(url);
    };
    // `models` is rebuilt every render; `modelKey` is what identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsDrawing, modelKey, color, orderId]);

  const src = broken ? null : preview ? fileUrl(preview.id) : image ?? drawn;
  const body = src
    ? <img src={src} alt={label} loading="lazy" onError={() => setBroken(true)} />
    : <span className={`order-thumb-empty ${needsDrawing && !failed ? 'loading' : ''}`} aria-hidden="true">3D</span>;

  return (
    <div className={`order-thumb ${small ? 'small' : ''}`} ref={ref}>
      {src && preview && linked ? <a href={src} target="_blank" rel="noreferrer" aria-label={label}>{body}</a> : body}
    </div>
  );
}
