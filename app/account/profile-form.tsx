'use client';

import { ChangeEvent, FormEvent, useState } from 'react';
import { authRequest } from '@/lib/auth-client';
import { ACCOUNT_COPY } from '@/lib/copy';
import type { LanguageKey } from '@/lib/language-config';

type ProfileFormProps = {
  language: LanguageKey;
  firstName: string;
  lastName: string;
  avatarUrl: string;
};

function resizeAvatar(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const size = 256;
      const scale = Math.min(size / image.width, size / image.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read image'));
    };
    image.src = objectUrl;
  });
}

export default function ProfileForm({ language, firstName: initialFirstName, lastName: initialLastName, avatarUrl: initialAvatarUrl }: ProfileFormProps) {
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const text = ACCOUNT_COPY[language];

  const chooseAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage(text.badImage);
      return;
    }
    try {
      setAvatarUrl(await resizeAvatar(file));
      setMessage(text.imageReady);
    } catch {
      setMessage(text.imageFailed);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await authRequest({ action: 'profile', first_name: firstName.trim(), last_name: lastName.trim(), avatar_url: avatarUrl });
      setMessage(text.saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.saveFailed);
    } finally { setBusy(false); }
  };

  return (
    <section className="profile-card">
      <div className="section-heading"><span>{text.profileTitle}</span><span className="estimate-badge">{text.optional}</span></div>
      <form className="profile-form" onSubmit={saveProfile}>
        <div className="profile-avatar-row">
          {avatarUrl ? <img className="profile-avatar" src={avatarUrl} alt="" /> : <span className="profile-avatar profile-avatar-empty">◎</span>}
          <label className="avatar-picker">{text.changePhoto}<input type="file" accept="image/*" onChange={chooseAvatar} /></label>
        </div>
        <div className="name-fields">
          <label>{text.firstName}<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required autoComplete="given-name" /></label>
          <label>{text.lastName}<input value={lastName} onChange={(event) => setLastName(event.target.value)} required autoComplete="family-name" /></label>
        </div>
        <button className="primary-button" disabled={busy}>{busy ? text.saving : text.save}</button>
      </form>
      {message && <p className="profile-message" role="status">{message}</p>}
    </section>
  );
}
