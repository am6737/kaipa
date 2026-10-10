import { getRouteGuide, GUIDE_SECTIONS, guideSourcesFor, missingGuideSections, type GuideSource, type RouteGuide } from '../_shared/route-guides.ts';

export type GuideLookup = (routeId: string) => RouteGuide | null;
export { getRouteGuide, missingGuideSections };
export type GuideEvidence = {
  routeName: string;
  routeId: string | null;
  markdown: string;
  asOf: string | null;
  sources: GuideSource[];
  missingSections: string[];
};

export function guideDisclosure(name: string, missing: string[]): string | null {
  if (!missing.length) return null;
  const headings = missing.map(key => GUIDE_SECTIONS.find(section => section.key === key)?.heading || key);
  return missing.includes('*') ? `${name}的路线指南尚未覆盖该路线，不能据此估算或编造。`
    : `${name}的路线指南尚未覆盖：${headings.join('、')}，不能据此估算或编造。`;
}

export function guideEvidence(name: string, routeId: string | null, lookup: GuideLookup = getRouteGuide): GuideEvidence {
  const guide = routeId ? lookup(routeId) : null;
  return {
    routeName: name, routeId, asOf: guide?.asOf ?? null,
    // Preserve the original body and make section-specific citations explicit.
    markdown: guide ? `${guide.markdown}\n\n章节引用：\n${guide.sections.map(section =>
      `${section.heading}：${JSON.stringify(guideSourcesFor(guide, [section.key]))}`).join('\n')}` : '',
    sources: guide?.sources ?? [], missingSections: missingGuideSections(guide),
  };
}

export async function guidesFingerprint(evidence: GuideEvidence[]): Promise<string> {
  const snapshot = [...evidence].sort((a, b) => a.routeName.localeCompare(b.routeName));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(snapshot)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Keep the once-per-run guard across stage retries. The durable receipt also
// deduplicates across worker recovery and concurrent conversational/research reads.
const attempted = new Set<string>();
export async function recordGuideGaps(admin: any, runId: string, userId: string, threadId: string, evidence: GuideEvidence): Promise<void> {
  if (!evidence.routeId || !evidence.missingSections.length) return;
  const key = `${runId}:${evidence.routeId}`;
  if (attempted.has(key)) return;
  attempted.add(key);
  if (attempted.size > 4096) attempted.delete(attempted.values().next().value!);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    try {
      if (!admin) throw new Error('Service-role client unavailable');
      const hash = await guidesFingerprint([{ ...evidence, routeName: '', markdown: '', asOf: null, sources: [], missingSections: [] }]);
      let receipt = admin.from('agent_tool_calls').upsert({
        run_id: runId, user_id: userId, thread_id: threadId,
        tool_name: 'record_route_guide_gaps', arguments_hash: hash,
        arguments: { routeId: evidence.routeId }, status: 'completed', output: { sections: evidence.missingSections },
      }, { onConflict: 'run_id,tool_name,arguments_hash', ignoreDuplicates: true }).select('id');
      if (receipt.abortSignal) receipt = receipt.abortSignal(controller.signal);
      const recorded = await receipt;
      if (recorded.error) throw recorded.error;
      if (!recorded.data?.length || controller.signal.aborted) return;
      let rpc = admin.rpc('record_route_guide_gaps', {
        p_route_id: evidence.routeId, p_sections: evidence.missingSections, p_run_id: runId,
      });
      if (rpc.abortSignal) rpc = rpc.abortSignal(controller.signal);
      const { error } = await rpc;
      if (error) throw error;
    } catch (error) {
      console.warn('[AppAgent] route guide gap telemetry failed', String(error instanceof Error ? error.message : (error as any)?.message || error).slice(0, 200));
    }
  };
  try {
    await Promise.race([work(), new Promise<void>(resolve => {
      timer = setTimeout(() => {
        controller.abort();
        console.warn('[AppAgent] route guide gap telemetry timed out');
        resolve();
      }, 200);
    })]);
  } finally { clearTimeout(timer); }
}
