import { compactHistoricalTools, sanitizeSessionItem } from './session-input.ts';

export type SessionRow = { id: number; item: Record<string, unknown> };
export type SessionMemory = { through_id: number; summary: string };
export type SummarizeMemory = (previous: string, items: unknown[]) => Promise<string>;

export function compactionBoundary(rows: SessionRow[], threshold = 32000, keepTurns = 6) {
  if (JSON.stringify(rows.map((row) => sanitizeSessionItem(row.item))).length < threshold) return 0;
  const starts = rows.flatMap((row, index) => row.item.role === 'user' ? [index] : []);
  // Never split a tool call/result pair or compact an in-flight turn.
  return starts.length > keepTurns ? starts[starts.length - keepTurns] : 0;
}

export function memoryInput(rows: SessionRow[]) {
  return compactHistoricalTools(rows.map((row) => ({ archiveId: row.id, ...sanitizeSessionItem(row.item) })));
}

export async function compactSession(rows: SessionRow[], memory: SessionMemory | undefined, summarize: SummarizeMemory, threshold = 32000) {
  const boundary = compactionBoundary(rows, threshold);
  if (!boundary) return { rows, memory };
  const older = rows.slice(0, boundary);
  const summary = (await summarize(memory?.summary || '', memoryInput(older))).trim();
  if (!summary || summary.length > 12000) throw new Error('Invalid session memory');
  return { rows: rows.slice(boundary), memory: { through_id: older.at(-1)!.id, summary } };
}
