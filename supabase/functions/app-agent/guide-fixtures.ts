import { REQUIRED_GUIDE_SECTIONS, GUIDE_SECTIONS, type RouteGuide } from '../_shared/route-guides.ts';

// No generated guide content is used by runtime guide assertions.
export function fixtureGuide(routeId = 'fixture-route'): RouteGuide {
  const sources = [
    { id: 'post', title: '实地路线记录', platform: 'xiaohongshu' as const, url: 'https://example.com/post', author: '记录者', observedOn: '2026-09-01', retrievedAt: '2026-09-02' },
    { id: 'local', title: '队员实地观察', platform: 'firsthand' as const, url: null, author: null, observedOn: '2026-09-03', retrievedAt: '2026-09-04' },
  ];
  const sections = REQUIRED_GUIDE_SECTIONS.map(key => ({ key, heading: GUIDE_SECTIONS.find(section => section.key === key)!.heading,
    sourceIds: key === 'overview' ? ['post', 'local'] : ['post'], body: `${key}：经人工维护的路线信息` }));
  return { routeId, title: '测试路线指南', variant: null, asOf: '2026-09-04', sources, sections,
    markdown: sections.map(section => `## ${section.heading}\n\n${section.body}`).join('\n\n') };
}

export function gapAdmin(failure: 'error' | 'throw' | 'hang' | null = null) {
  const calls: Array<{ name: string; args: any }> = [];
  const receipts = new Set<string>();
  return { calls, receipts,
    rpc(name: string, args: unknown) {
      calls.push({ name, args });
      if (failure === 'throw') throw new Error('telemetry failed');
      if (failure === 'hang') return new Promise(() => {});
      return Promise.resolve({ data: 1, error: failure === 'error' ? { message: 'telemetry unavailable' } : null });
    },
    from(_table: string) {
      let inserted: any;
      const chain = {
        upsert(row: any, _options?: unknown) { inserted = row; return chain; },
        select(_columns?: string) { return chain; },
        then(resolve: (value: unknown) => unknown) {
          const key = `${inserted.run_id}:${inserted.arguments_hash}`;
          const data = receipts.has(key) ? [] : [{ id: 'gap-receipt' }];
          receipts.add(key);
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
}
