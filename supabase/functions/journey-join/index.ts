import { authenticate, boundedJson, rate, resourceCors, serviceClient, rpc } from '../_shared/resource-guard.ts';

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { ...resourceCors, 'Content-Type': 'application/json' },
});

async function sha256Hex(value: string | null): Promise<string | null> {
  if (!value) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function isPrivatePeer(peer: string): boolean {
  return !peer || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|::1$|fc|fd)/i.test(peer);
}

Deno.serve(async (req, info) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: resourceCors });
  if (req.method !== 'POST') return json({ status: 'busy' });

  try {
    const db = serviceClient();
    const auth = await authenticate(req, db);
    const body = await boundedJson(req, 4096);
    const peer = 'hostname' in info.remoteAddr ? info.remoteAddr.hostname : '';
    // A gateway/private address is shared by callers, so it cannot identify one user.
    const privatePeer = isPrivatePeer(peer);
    await rate(db, 'journey_join', auth.user.id);
    if (!privatePeer) await rate(db, 'journey_join_peer', `peer:${peer}`);

    const result = await rpc<any>(db, 'join_journey_by_code', {
      p_user: auth.user.id,
      p_code: body?.code,
      p_ip_hash: await sha256Hex(privatePeer ? null : peer),
      p_device_hash: await sha256Hex(req.headers.get('x-device-id')),
    });
    return json({ status: result.status, ...(result.journey_id ? { journeyId: result.journey_id } : {}) });
  } catch (error) {
    console.error(error);
    return json({ status: 'busy' });
  }
});
