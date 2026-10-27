// outingImport.ts — 从时间线导入以前的轨迹时，判断一个文件是不是已经有了。
//
// 同一次徒步可能已经在 App 里录过，或者早先从「我的轨迹」导入过。前一种算时间线
// 上已经有了，直接跳过；后一种只差一个「是本人走过」的标记，补上就行，不再传一份
// 文件。

import type { Track } from '../data/tracks';
import type { ParsedTrackFile } from './trackImport';

export type ExistingMatch = {
  track: Track;
  /** 已经出现在时间线上：App 内录的、标记过本人走过的，或挂在旅程上的。 */
  onTimeline: boolean;
};

// 两个 App 导出同一次记录，起点时间会差几秒，距离按各自的算法差一点。
const START_TOLERANCE_MS = 2 * 60 * 1000;
const DIST_TOLERANCE = 0.03;

function closeDistance(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(100, Math.max(a, b) * DIST_TOLERANCE);
}

export function findExistingTrack(
  parsed: ParsedTrackFile,
  tracks: Track[],
  journeyTrackIds: Set<string>,
): ExistingMatch | undefined {
  const start = parsed.stats.startTime?.getTime();
  const dist = parsed.stats.distM;
  const track = tracks.find((candidate) => {
    if (candidate.distM == null || !closeDistance(candidate.distM, dist)) return false;
    const candidateStart = candidate.startedAt ? Date.parse(candidate.startedAt) : NaN;
    if (start != null && Number.isFinite(candidateStart)) return Math.abs(candidateStart - start) <= START_TOLERANCE_MS;
    // 都没有时间时只能看名字，同名同长度基本就是同一个文件。
    return start == null && !Number.isFinite(candidateStart) && candidate.name.trim() === parsed.name.trim();
  });
  if (!track) return undefined;
  return { track, onTimeline: !track.fileFormat || Boolean(track.ownOuting) || journeyTrackIds.has(track.id) };
}

/** 没有时间的文件按选的那天中午记，换时区也不会跳到前一天。 */
export function noonOf(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day, 12).toISOString();
}
