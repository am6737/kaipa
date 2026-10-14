import { guestSupabase } from './supabaseGuest';
import { guestRequest } from './guestResources';
export async function uploadGuestPhoto(uri: string, shareId: string, sessionToken: string, guard: () => void = () => {}): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('无法读取图片');
  const blob = await response.blob();
  guard();
  const ticket = await guestRequest<{bucket:string;path:string;token:string}>({action:'guest_upload',bytes:blob.size,mime:blob.type},sessionToken);
  guard();
  const {error} = await guestSupabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path,ticket.token,blob,{contentType:blob.type,upsert:false});
  guard();
  if (error) throw error;
  return guestSupabase.storage.from(ticket.bucket).getPublicUrl(ticket.path).data.publicUrl;
}
