import { strict as assert } from 'node:assert';
import { blockedFrame, realtimeGuard } from './server.ts';

Deno.test(
  'blocks legacy topics in both Phoenix serializers and rejects malformed input',
  () => {
    assert.equal(
      blockedFrame(
        JSON.stringify({
          topic: 'realtime:journey-presence:j1',
          event: 'presence',
          ref: '1',
        }),
      ),
      true,
    );
    assert.equal(
      blockedFrame(
        JSON.stringify([
          '1',
          '2',
          'realtime:journey-presence:j1',
          'presence',
          {},
        ]),
      ),
      true,
    );
    assert.equal(
      blockedFrame(
        JSON.stringify({ topic: 'realtime:journeys', event: 'presence' }),
      ),
      false,
    );
    assert.throws(() => blockedFrame('not JSON'));
    assert.throws(() => blockedFrame(JSON.stringify([1, 2])));
  },
);

Deno.test(
  'existing socket receives explicit track rejection while ordinary channels work',
  async () => {
    let forwarded = 0;
    const sockets: WebSocket[] = [];
    const upstream = Deno.serve(
      { port: 0, hostname: '127.0.0.1', onListen() {} },
      (req) => {
        const { socket, response } = Deno.upgradeWebSocket(req);
        sockets.push(socket);
        socket.onmessage = (event) => {
          forwarded++;
          socket.send(event.data);
        };
        return response;
      },
    );
    const guard = Deno.serve(
      { port: 0, hostname: '127.0.0.1', onListen() {} },
      realtimeGuard(`http://127.0.0.1:${upstream.addr.port}`),
    );
    const ws = new WebSocket(
      `ws://127.0.0.1:${guard.addr.port}/socket/websocket`,
    );
    const exchange = (frame: unknown) =>
      new Promise<any>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Timeout is not a rejection')),
          3000,
        );
        ws.onmessage = (event) => {
          clearTimeout(timer);
          resolve(JSON.parse(event.data));
        };
        ws.send(JSON.stringify(frame));
      });
    try {
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = reject;
      });
      const ordinary = {
        topic: 'realtime:journeys',
        event: 'phx_join',
        ref: '1',
        payload: {},
      };
      assert.deepEqual(await exchange(ordinary), ordinary);
      // The same established socket cannot forward an old location track even
      // without a join; identity is never passed upstream.
      const denied = await exchange({
        topic: 'realtime:journey-presence:j1',
        event: 'presence',
        ref: '2',
        payload: { userId: 'victim' },
      });
      assert.equal(denied.event, 'phx_reply');
      assert.equal(denied.payload.status, 'error');
      assert.equal(denied.payload.response.reason, 'legacy_location_disabled');
      const v2 = await exchange([
        '1',
        '3',
        'realtime:journey-presence:j1',
        'phx_join',
        {},
      ]);
      assert.equal(v2[4].status, 'error');
      assert.equal(forwarded, 1);
      const broadcast = await fetch(
        `http://127.0.0.1:${guard.addr.port}/api/broadcast`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ topic: 'journey-presence:j1', payload: {} }],
          }),
        },
      );
      assert.equal(broadcast.status, 403);
      await broadcast.text();
    } finally {
      const ended = new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
      ws.close();
      await ended;
      for (const socket of sockets)
        if (socket.readyState === WebSocket.OPEN) socket.close();
      await guard.shutdown();
      await upstream.shutdown();
    }
  },
);
