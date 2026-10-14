import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';
import type { CompanionPresence } from './companionPresence';

export class LocationRequestError extends Error {
  constructor(public status: number) {
    super(`Location request failed (${status})`);
  }
}

export async function locationRequest(
  journeyId: string,
  action: string,
  fields: Record<string, unknown> = {},
) {
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.is_anonymous)
    throw new LocationRequestError(401);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/journey-location`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...fields, journeyId, action }),
      },
    );
    if (!response.ok) throw new LocationRequestError(response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export type LocationRequester = typeof locationRequest;

/** One foreground device lease. Close cannot resurrect an in-flight open or publish. */
export class LocationPublisher {
  private generation = 0;
  private opening: Promise<string> | null = null;
  private sessionId: string | null = null;
  private sequence = 0;
  private publishing = false;
  constructor(
    private journeyId: string,
    private request: LocationRequester = locationRequest,
  ) {}

  async begin() {
    const generation = ++this.generation;
    this.sequence = 0;
    const opening = this.request(this.journeyId, 'open').then((result) =>
      String(result.sessionId),
    );
    this.opening = opening;
    const sessionId = await opening;
    if (this.generation !== generation) return false;
    this.sessionId = sessionId;
    return true;
  }

  async publish(
    position: CompanionPresence,
  ): Promise<CompanionPresence | null> {
    const sessionId = this.sessionId;
    if (!sessionId || this.publishing) return null;
    const generation = this.generation;
    this.publishing = true;
    try {
      const result = await this.request(this.journeyId, 'publish', {
        sessionId,
        sequence: ++this.sequence,
        userId: position.userId,
        longitude: position.longitude,
        latitude: position.latitude,
      });
      return generation === this.generation
        ? { ...result, seenAt: Date.now() }
        : null;
    } finally {
      this.publishing = false;
    }
  }

  async stop() {
    ++this.generation;
    const opening = this.opening;
    const sessionId = this.sessionId;
    this.sessionId = null;
    this.opening = null;
    if (!sessionId && !opening) return;
    // Even a late open must be closed. A tombstone defeats reordered writes;
    // each restart uses a different ID, including rapid off/on on one journey.
    const id = sessionId || (await opening!);
    await this.request(this.journeyId, 'close', { sessionId: id });
  }
}
