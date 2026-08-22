'use client';

import { ChangeEvent, FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type ProfileFormProps = {
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

export default function ProfileForm({ firstName: initialFirstName, lastName: initialLastName, avatarUrl: initialAvatarUrl }: ProfileFormProps) {
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const chooseAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('اختار صورة بصيغة صحيحة.');
      return;
    }
    try {
      setAvatarUrl(await resizeAvatar(file));
      setMessage('الصورة جاهزة للحفظ.');
    } catch {
      setMessage('تعذر قراءة الصورة. جرّب صورة أخرى.');
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const { error } = await createClient().auth.updateUser({
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        avatar_url: avatarUrl,
      },
    });
    setMessage(error ? 'تعذر حفظ البيانات الآن.' : 'تم تحديث بيانات الحساب.');
    setBusy(false);
  };

  return (
    <section className="profile-card">
      <div className="section-heading"><span>بيانات الحساب</span><span className="estimate-badge">اختياري</span></div>
      <form className="profile-form" onSubmit={saveProfile}>
        <div className="profile-avatar-row">
          {avatarUrl ? <img className="profile-avatar" src={avatarUrl} alt="" /> : <span className="profile-avatar profile-avatar-empty">◎</span>}
          <label className="avatar-picker">تغيير الصورة<input type="file" accept="image/*" onChange={chooseAvatar} /></label>
        </div>
        <div className="name-fields">
          <label>الاسم الأول<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required autoComplete="given-name" /></label>
          <label>اسم العائلة<input value={lastName} onChange={(event) => setLastName(event.target.value)} required autoComplete="family-name" /></label>
        </div>
        <button className="primary-button" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}</button>
      </form>
      {message && <p className="profile-message" role="status">{message}</p>}
    </section>
  );
}
