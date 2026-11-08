'use client';

import { ChangeEvent, useState } from 'react';
import { toWebp } from '@/lib/image-webp';

export type PickedImage = { file: File; url: string };

type ImagePickerProps = {
  images: PickedImage[];
  onChange: (images: PickedImage[]) => void;
  max: number;
  label: string;
  hint?: string;
  /** Labels in the page's language. */
  text: { add: string; remove: string; working: string; failed: string };
};

/** Lets people pick several photos; each one is shrunk and converted to WebP before it is kept. */
export default function ImagePicker({ images, onChange, max, label, hint, text }: ImagePickerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []).slice(0, Math.max(0, max - images.length));
    event.target.value = '';
    if (!chosen.length) return;
    setBusy(true);
    setError('');
    const converted: PickedImage[] = [];
    for (const file of chosen) {
      try {
        const webp = await toWebp(file);
        converted.push({ file: webp, url: URL.createObjectURL(webp) });
      } catch {
        setError(text.failed);
      }
    }
    onChange([...images, ...converted]);
    setBusy(false);
  };

  const remove = (index: number) => {
    URL.revokeObjectURL(images[index].url);
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="image-picker">
      <span className="image-picker-label">{label} <small>{images.length}/{max}</small></span>
      <div className="image-picker-grid">
        {images.map((image, index) => (
          <figure key={image.url}>
            <img src={image.url} alt="" />
            <button type="button" onClick={() => remove(index)} aria-label={text.remove}>×</button>
          </figure>
        ))}
        {images.length < max && (
          <label className={`image-picker-add ${busy ? 'busy' : ''}`}>
            <input type="file" accept="image/*" multiple disabled={busy} onChange={add} />
            <span>{busy ? text.working : `+ ${text.add}`}</span>
          </label>
        )}
      </div>
      {hint && <small className="image-picker-hint">{hint}</small>}
      {error && <small className="image-picker-error" role="alert">{error}</small>}
    </div>
  );
}
