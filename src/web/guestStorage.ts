import { guestSupabase } from './supabaseGuest';
import { guestRequest } from './guestResources';
import { fitImage } from '../lib/imageFit';
export async function uploadGuestPhoto(uri: string, shareId: string, sessionToken: string): Promise<string> {
  // Shared walls show photos at screen size; the original only eats the day's quota.
  const fitted = await fitImage(uri, 2560);
  const response = await fetch(fitted?.uri ?? uri);
  if (!response.ok) throw new Error('无法读取图片');
  const blob = await response.blob();
  const ticket = await guestRequest<{bucket:string;path:string;token:string}>({action:'guest_upload',bytes:blob.size,mime:blob.type},sessionToken);
  const {error} = await guestSupabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path,ticket.token,blob,{contentType:blob.type,upsert:false});
  if (error) throw error;
  return guestSupabase.storage.from(ticket.bucket).getPublicUrl(ticket.path).data.publicUrl;
}
