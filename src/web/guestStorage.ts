import { guestSupabase } from './supabaseGuest';

export async function uploadGuestPhoto(
  uri: string,
  shareId: string,
): Promise<string | null> {
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    const ext = blob.type === 'image/png' ? 'png' : 'jpg';
    const path = `${shareId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await guestSupabase.storage
      .from('shared-moments')
      .upload(path, blob, { contentType: blob.type, upsert: false });

    if (error) {
      console.warn('[guestStorage] upload error:', error.message);
      return null;
    }

    const { data } = guestSupabase.storage
      .from('shared-moments')
      .getPublicUrl(path);

    return data.publicUrl;
  } catch (e) {
    console.warn('[guestStorage] upload failed:', e);
    return null;
  }
}
