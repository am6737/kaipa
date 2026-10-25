// 导入行程: client side of the import flow. readItinerary sends text and
// screenshots to the itinerary-import function, which only transcribes them;
// saveImportedItinerary writes the checked draft in one transaction.
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { File as FSFile } from 'expo-file-system';
import { supabase } from './supabase';
import { fitImage } from './imageFit';
import { refetchJourneyTimeline } from '../hooks/useTimeline';
import type { ImportedDay, ImportedItinerary, IssueSeverity } from './itineraryCheck';

export const IMPORT_MAX_IMAGES = 4;
// Long screenshots carry small text; keep more pixels than the 1600 px used for photos.
const IMAGE_MAX_EDGE = 2400;
const IMAGE_MAX_BASE64 = 4_000_000;

export type ImportImage = { uri: string; base64?: string | null; mimeType?: string | null };

export class ItineraryImportError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function imagePayload(image: ImportImage) {
  let contentType = image.mimeType || 'image/jpeg';
  let base64 = '';
  const fitted = Platform.OS !== 'web' ? await fitImage(image.uri, IMAGE_MAX_EDGE) : null;
  try {
    base64 = fitted ? await new FSFile(fitted.uri).base64() : image.base64 || await new FSFile(image.uri).base64();
    if (fitted) contentType = fitted.mimeType;
  } catch {
    throw new ItineraryImportError('image_read_failed', '无法读取所选截图，请重新选择');
  }
  base64 = base64.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  if (!base64) throw new ItineraryImportError('image_read_failed', '无法读取所选截图，请重新选择');
  if (base64.length > IMAGE_MAX_BASE64) throw new ItineraryImportError('image_too_large', '截图过大，请裁剪后重试');
  return { base64, contentType };
}

type ReadResponse = { itinerary?: ImportedItinerary; error?: { code?: string; message?: string } };

export async function readItinerary(input: { text: string; images: ImportImage[] }): Promise<ImportedItinerary> {
  const images = [];
  for (const image of input.images.slice(0, IMPORT_MAX_IMAGES)) images.push(await imagePayload(image));
  const { data, error } = await supabase.functions.invoke<ReadResponse>('itinerary-import', {
    body: { text: input.text.trim(), images },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    const body = context ? await context.clone().json().catch(() => null) as ReadResponse | null : null;
    throw new ItineraryImportError(body?.error?.code || 'request_failed', body?.error?.message || '行程识别失败，请稍后重试');
  }
  if (data?.error || !data?.itinerary?.days?.length) {
    throw new ItineraryImportError(data?.error?.code || 'empty_result', data?.error?.message || '没有识别出逐日行程，请补充文字或换一张更清晰的截图');
  }
  return data.itinerary;
}

function clockMinutes(value: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** The day's group note: its route line, then the stated numbers. */
export function importedDayNote(day: ImportedDay, labels: { km: string; ascent: string; descent: string }) {
  const stats = [
    day.distanceKm != null ? `${labels.km} ${day.distanceKm} km` : '',
    day.ascentM != null ? `${labels.ascent} ${day.ascentM} m` : '',
    day.descentM != null ? `${labels.descent} ${day.descentM} m` : '',
  ].filter(Boolean).join('  ');
  return [day.title, stats].filter(Boolean).join('\n');
}

export async function saveImportedItinerary(input: {
  itinerary: ImportedItinerary;
  requestId: string;
  sources: Array<'text' | 'image'>;
  issueCounts: Record<IssueSeverity, number>;
  noteLabels: { km: string; ascent: string; descent: string };
}): Promise<string> {
  const { itinerary } = input;
  const days = itinerary.days.map((day) => {
    const items = day.items.map((item) => ({
      title: item.title,
      kind: item.kind,
      timeMins: clockMinutes(item.timeStart),
      timeEndMins: clockMinutes(item.timeEnd),
    }));
    // A stay named only on the day becomes the day's last row.
    if (day.stay && !day.items.some((item) => item.kind === 'stay')) items.push({ title: day.stay, kind: 'stay', timeMins: null, timeEndMins: null });
    return { note: importedDayNote(day, input.noteLabels), items };
  });
  const { data, error } = await supabase.rpc('create_journey_from_import', {
    p_request_id: input.requestId,
    p_journey: {
      name: itinerary.name,
      routeId: itinerary.routeId,
      startDate: itinerary.startDate,
      sources: input.sources,
      issueCounts: input.issueCounts,
    },
    p_days: days,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('journey_create_empty_result');
  await refetchJourneyTimeline(data);
  return data;
}

export const newImportRequestId = () => Crypto.randomUUID();
