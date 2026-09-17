import { conversationAttachments } from './conversation-attachments.ts';
import type { AgentAttachment } from './types.ts';

function file(name: string): AgentAttachment {
  return { kind: 'file', name, url: `https://example.test/${name}`, mimeType: 'application/octet-stream' };
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

Deno.test('recovers an uploaded track after natural-language clarification lost flow metadata', () => {
  const track = file('route.gpx');
  const result = conversationAttachments([], [], [[], [], [track]]);
  assert(result.length === 1 && result[0] === track, 'use the original conversation upload');
});
Deno.test('new documents do not discard earlier track attachments', () => {
  const track = file('route.gpx');
  const guide = file('guide.pdf');
  const result = conversationAttachments([guide], [], [[track]]);
  assert(result.includes(track) && result.includes(guide), 'both files must remain available');
});
Deno.test('deduplicates URLs and prioritizes current then newest historical uploads', () => {
  const old = file('old.gpx'), recent = file('recent.gpx');
  const result = conversationAttachments([recent], [old], [[recent], [old]]);
  assert(result.length === 2 && result[0] === recent && result[1] === old, 'keep upload priority without duplicates');
});
Deno.test('queued recovery retains the captured attachment context without history lookup', () => {
  const track = file('route.gpx');
  assert(conversationAttachments([], [track], [])[0] === track, 'worker context must survive client disconnect');
});
