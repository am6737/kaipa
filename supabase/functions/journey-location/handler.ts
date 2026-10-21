import {
  authenticate,
  boundedJson,
  resourceCors,
  resourceFailure,
  ResourceError,
  rpc,
  serviceClient,
} from '../_shared/resource-guard.ts';

export async function handleLocation(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: resourceCors });
  if (req.method !== 'POST')
    return resourceFailure(new ResourceError('invalid_request', 405));
  try {
    const db = serviceClient();
    const { user } = await authenticate(req, db); // Auth verifies the JWT, not decode-only.
    if (user.is_anonymous) throw new ResourceError('forbidden', 403);
    const body = await boundedJson(req, 4096);
    if (
      !body ||
      typeof body.journeyId !== 'string' ||
      body.journeyId.length > 200 ||
      !['open', 'publish', 'close', 'snapshot'].includes(body.action)
    )
      throw new ResourceError('invalid_request', 400);
    // Explicitly reject identity spoofing; the RPC actor is always the verified user.
    if (body.userId !== undefined && body.userId !== user.id)
      throw new ResourceError('forbidden', 403);
    if (
      body.action === 'publish' &&
      (!Number.isFinite(body.longitude) ||
        Math.abs(body.longitude) > 180 ||
        !Number.isFinite(body.latitude) ||
        Math.abs(body.latitude) > 90 ||
        !Number.isSafeInteger(body.sequence) ||
        body.sequence < 1)
    )
      throw new ResourceError('invalid_request', 400);
    const result = await rpc(db, 'journey_location_request', {
      p_actor: user.id,
      p_journey: body.journeyId,
      p_action: body.action,
      p_session: body.sessionId ?? null,
      p_sequence: body.sequence ?? null,
      p_longitude: body.longitude ?? null,
      p_latitude: body.latitude ?? null,
    });
    return new Response(JSON.stringify(result), {
      headers: {
        ...resourceCors,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return resourceFailure(error);
  }
}
