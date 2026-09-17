import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'npm:fflate@0.8.3';
import { assistantStoragePath, InvalidTrackError, loadTrackAttachment, trackInput } from './attachments.ts';
import { sanitizeSessionItem } from './session-input.ts';

const user = 'test-user';
const file = (name: string) => ({ kind: 'file' as const, name, mimeType: 'application/gpx+xml', url: `https://storage.test/storage/v1/object/public/kaipa/assistant/${user}/${name}` });
const gpx = '<gpx><trk><name>Test trail</name><trkseg><trkpt lat="25" lon="110"><ele>100</ele></trkpt><trkpt lat="25.01" lon="110.01"><ele>120</ele></trkpt></trkseg></trk></gpx>';
const kml = '<kml><Placemark><name>Test trail</name><LineString><coordinates>110,25,100 110.01,25.01,120</coordinates></LineString></Placemark></kml>';
const storage = (bytes: Uint8Array) => ({ storage: { from: (bucket: string) => {
  assert.equal(bucket, 'kaipa');
  return { download: async (path: string) => {
    assert.ok(path.startsWith(`assistant/${user}/`));
    return { data: new Blob([bytes as Uint8Array<ArrayBuffer>]), error: null };
  } };
} } });

Deno.test('GPX, KML and KMZ become bounded text summaries, not model file inputs', async () => {
  for (const [name, bytes] of [
    ['route.gpx', strToU8(gpx)], ['route.kml', strToU8(kml)], ['route.kmz', zipSync({ 'doc.kml': strToU8(kml) })],
  ] as const) {
    const client = storage(bytes);
    const input = await trackInput(client, file(name), user);
    assert.equal(input.type, 'input_text');
    assert.ok(input.text.includes(name));
    assert.ok(!input.text.includes('base64'));
    const track = await loadTrackAttachment(client, file(name), user);
    assert.equal(track.trackCoords.length, 2);
    assert.equal(track.fileUrl, file(name).url);
    assert.deepEqual(track.start, { lng: 110, lat: 25 });
    // Library-row values travel with the parsed track; journeys only reference the row.
    assert.equal(track.pointCount, 2);
    assert.ok(track.distM > 0);
    assert.equal(track.ascM, 20);
  }
});

Deno.test('invalid, empty, oversized and out-of-range tracks are rejected before model execution', async () => {
  for (const text of ['', '<gpx/>', gpx.replace('lat="25"', 'lat="95"')]) {
    await assert.rejects(() => trackInput(storage(strToU8(text)), file('bad.gpx'), user), InvalidTrackError);
  }
  await assert.rejects(() => trackInput(storage(new Uint8Array(15 * 1024 * 1024 + 1)), file('large.gpx'), user), InvalidTrackError);
  const bomb = zipSync({ 'doc.kml': new Uint8Array(15 * 1024 * 1024 + 1) });
  await assert.rejects(() => trackInput(storage(bomb), file('large.kmz'), user), InvalidTrackError);
});

Deno.test('storage paths are owner-scoped and do not trust arbitrary hosts', () => {
  assert.equal(assistantStoragePath(file('route.gpx').url, 'another-user'), null);
  assert.equal(assistantStoragePath('https://host.test/not-storage/route.gpx', user), null);
  assert.equal(assistantStoragePath('https://host.test/storage/v1/object/public/kaipa/assistant/test-user/%2e%2e%2fother/file', user), null);
  assert.equal(assistantStoragePath(file('route.gpx').url, user), 'assistant/test-user/route.gpx');
});

Deno.test('legacy sessions strip raw track files without mutating stored records or other attachments', () => {
  const item = { role: 'user', content: [{ type: 'input_file', filename: 'route.gpx', file: 'data:application/gpx+xml;base64,abc' }, { type: 'input_file', filename: 'guide.pdf' }] };
  const cleaned = sanitizeSessionItem(item);
  assert.equal(cleaned.content[0].type, 'input_text');
  assert.equal(cleaned.content[1].type, 'input_file');
  assert.equal(item.content[0].type, 'input_file');
});
