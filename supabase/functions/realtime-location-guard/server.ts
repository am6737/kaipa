// Place this between every Realtime ingress and its private upstream. The
// upstream MUST have no public route. See README for old-connection draining.
const legacy = (topic: unknown) =>
  typeof topic === 'string' && topic.startsWith('realtime:journey-presence:');
export function readFrame(text: string): {
  topic: unknown;
  ref: unknown;
  join_ref: unknown;
  event: unknown;
} {
  const raw = JSON.parse(text);
  if (Array.isArray(raw)) {
    if (raw.length !== 5) throw new Error('Invalid Phoenix frame');
    return { join_ref: raw[0], ref: raw[1], topic: raw[2], event: raw[3] };
  }
  if (!raw || typeof raw !== 'object' || typeof raw.topic !== 'string')
    throw new Error('Invalid Phoenix frame');
  return raw;
}
export function blockedFrame(text: string): boolean {
  return legacy(readFrame(text).topic);
}

export function realtimeGuard(
  upstream: string,
  mapPath: (path: string) => string = (path) => path,
) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const target = new URL(mapPath(url.pathname) + url.search, upstream);
    // Client HTTP broadcasts must not preserve a bypass around the WS guard.
    if (url.pathname.endsWith('/api/broadcast') && req.method === 'POST') {
      const body = await req
        .clone()
        .json()
        .catch(() => null);
      if (!body || !Array.isArray(body.messages))
        return new Response('Invalid broadcast', { status: 400 });
      if (
        body.messages.some((m: { topic?: string }) =>
          legacy('realtime:' + m.topic),
        )
      ) {
        return new Response('legacy_location_disabled', { status: 403 });
      }
    }
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return fetch(target, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        redirect: 'manual',
      });
    }
    const { socket: downstream, response } = Deno.upgradeWebSocket(req);
    target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
    // Supabase sends credentials as WS query params / access_token messages.
    const backend = new WebSocket(target);
    const queue: string[] = [];
    let stopped = false;
    const close = () => {
      stopped = true;
      queue.length = 0;
      if (downstream.readyState === WebSocket.OPEN)
        downstream.close(1008, 'Realtime connection closed');
      if (backend.readyState === WebSocket.OPEN) backend.close(1000);
    };
    downstream.onmessage = (event) => {
      try {
        if (typeof event.data !== 'string' || event.data.length > 1024 * 1024) {
          close();
          return;
        }
        const frame = readFrame(event.data);
        if (legacy(frame.topic)) {
          // Explicit authorization rejection, including presence on a socket
          // already carrying other channels. Never forward the spoofed payload.
          const payload = {
            status: 'error',
            response: { reason: 'legacy_location_disabled' },
          };
          const reply = Array.isArray(JSON.parse(event.data))
            ? [frame.join_ref, frame.ref, frame.topic, 'phx_reply', payload]
            : {
                topic: frame.topic,
                event: 'phx_reply',
                ref: frame.ref,
                join_ref: frame.join_ref,
                payload,
              };
          downstream.send(JSON.stringify(reply));
          return;
        }
        if (backend.readyState === WebSocket.OPEN) backend.send(event.data);
        else if (
          backend.readyState === WebSocket.CONNECTING &&
          queue.length < 32
        )
          queue.push(event.data);
        else close();
      } catch {
        close();
      }
    };
    backend.onopen = () => {
      if (stopped) {
        backend.close();
        return;
      }
      for (const text of queue) backend.send(text);
      queue.length = 0;
    };
    backend.onmessage = (event) => {
      try {
        if (typeof event.data !== 'string' || blockedFrame(event.data)) return;
        if (downstream.readyState === WebSocket.OPEN)
          downstream.send(event.data);
      } catch {
        close();
      }
    };
    backend.onerror = close;
    downstream.onerror = close;
    backend.onclose = close;
    downstream.onclose = close;
    return response;
  };
}
if (import.meta.main) {
  const upstream = Deno.env.get('REALTIME_UPSTREAM');
  if (!upstream) throw new Error('REALTIME_UPSTREAM is required');
  Deno.serve(
    { port: Number(Deno.env.get('PORT') || 4001) },
    realtimeGuard(upstream),
  );
}
