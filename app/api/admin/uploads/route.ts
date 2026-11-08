import { NextResponse } from 'next/server';
import { getAdmin, sameOrigin } from '@/lib/auth';
import { MAX_DESIGN_IMAGES, MAX_IMAGE_BYTES, readForm, saveDesignImages, UploadError } from '@/lib/uploads';

export const runtime = 'nodejs';

/** Product photos for ready designs. The browser sends them already converted to WebP. */
export async function POST(request: Request) {
  if (!sameOrigin(request) || !(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const form = await readForm(request, MAX_DESIGN_IMAGES * MAX_IMAGE_BYTES + 1024 * 1024);
    const images = form.getAll('images').filter((item): item is File => item instanceof File);
    return NextResponse.json({ urls: await saveDesignImages(images) });
  } catch (error) {
    const message = error instanceof UploadError ? error.message : 'تعذر رفع الصور.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
