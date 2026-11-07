'use client';

import { ChangeEvent, FormEvent, useState } from 'react';
import { UserIcon } from '@/components/icons';
import { authRequest, type User } from '@/lib/auth-client';
import { ACCOUNT_COPY } from '@/lib/copy';
import type { LanguageKey } from '@/lib/language-config';

type ProfileFormProps = {
  language: LanguageKey;
  user: User;
  onSaved: (user: User) => void;
  onCancel: () => void;
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

/** Compact profile editor shown inside the account menu. */
export default function ProfileForm({ language, user, onSaved, onCancel }: ProfileFormProps) {
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);
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
      setMessage('');
    } catch {
      setMessage(text.imageFailed);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await authRequest({ action: 'profile', first_name: firstName.trim(), last_name: lastName.trim(), avatar_url: avatarUrl });
      onSaved(result.user ?? { ...user, first_name: firstName.trim(), last_name: lastName.trim(), avatar_url: avatarUrl });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.saveFailed);
    } finally { setBusy(false); }
  };

  return (
    <form className="profile-form" onSubmit={saveProfile}>
      <div className="profile-avatar-row">
        {avatarUrl ? <img className="profile-avatar" src={avatarUrl} alt="" /> : <span className="profile-avatar profile-avatar-empty"><UserIcon size={22} /></span>}
        <label className="avatar-picker">{text.changePhoto}<input type="file" accept="image/*" onChange={chooseAvatar} /></label>
      </div>
      <div className="name-fields">
        <label>{text.firstName}<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required maxLength={80} autoComplete="given-name" /></label>
        <label>{text.lastName}<input value={lastName} onChange={(event) => setLastName(event.target.value)} required maxLength={80} autoComplete="family-name" /></label>
      </div>
      {message && <p className="profile-message" role="alert">{message}</p>}
      <div className="profile-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>{text.cancel}</button>
        <button className="primary-button compact" disabled={busy}>{busy ? text.saving : text.save}</button>
      </div>
    </form>
  );
}
