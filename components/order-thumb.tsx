'use client';

import { useEffect, useRef, useState } from 'react';
import { renderModelPreview } from '@/lib/model-preview';
import type { OrderFile } from '@/lib/uploads';

/** `linked` opens the saved preview full size; leave it off where the thumbnail sits inside a button. */
type Props = { orderId: string; files: OrderFile[]; color?: string; image?: string; label: string; linked?: boolean };

/**
 * A picture of what was ordered: the preview saved with the order, the product photo of a ready design,
 * or, for older orders that have only the model, a picture drawn from the model when the card scrolls into view.
 */
export default function OrderThumb({ orderId, files, color = '#9aa4b2', image, label, linked = false }: Props) {
  const fileUrl = (id: string) => `/api/orders/${orderId}/files/${id}`;
  const preview = files.find((file) => file.kind === 'preview');
  const model = files.find((file) => file.kind === 'model');
  const ref = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [broken, setBroken] = useState(false);
  const needsDrawing = !preview && !image && Boolean(model);

  useEffect(() => {
    const host = ref.current;
    if (!needsDrawing || !model || !host) return;
    let cancelled = false;
    let url = '';
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      try {
        const response = await fetch(fileUrl(model.id));
        if (!response.ok) throw new Error('Download failed');
        const picture = await renderModelPreview(await response.blob(), model.name, color);
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
    // fileUrl only depends on orderId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsDrawing, model?.id, model?.name, color, orderId]);

  const src = broken ? null : preview ? fileUrl(preview.id) : image ?? drawn;
  const body = src
    ? <img src={src} alt={label} loading="lazy" onError={() => setBroken(true)} />
    : <span className={`order-thumb-empty ${needsDrawing && !failed ? 'loading' : ''}`} aria-hidden="true">3D</span>;

  return (
    <div className="order-thumb" ref={ref}>
      {src && preview && linked ? <a href={src} target="_blank" rel="noreferrer" aria-label={label}>{body}</a> : body}
    </div>
  );
}
