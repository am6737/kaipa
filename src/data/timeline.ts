// timeline.ts — the unified 行程 model. ONE concept: a checkable, user-grouped
// list of rich records. Groups are user-defined strings (e.g. "交通", "徒步",
// "住宿" — whatever the user wants). Progress = how many rows are checked off.
// Checks are purely manual. Gear checklist stays separate.

export interface TLMedia {
  tone: string;
  uri?: string;
  thumb?: string;
  video?: boolean;
  livePhoto?: boolean;
  pairedVideoUri?: string;
  caption?: string;
  createdAt?: string;
  author?: {
    ini: string;
    name: string;
    color: string;
    avatarUrl?: string;
  };
}
export interface TLRow {
  id: string;
  title: string;
  day: string;
  media?: TLMedia[];
  timeStart?: number; // minutes from midnight (0–1439), 24h start time; undefined = no time
  timeEnd?: number;   // minutes from midnight, 24h end time; undefined = no end
  synth?: boolean;
  custom?: boolean;
  checked?: boolean;
}
export interface TLGroup {
  key: string;
  label: string;
  rows: TLRow[];
}
