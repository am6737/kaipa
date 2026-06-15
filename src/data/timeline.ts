// timeline.ts — the unified 行程 model. ONE concept: a checkable, user-grouped
// list of rich records. Groups are user-defined strings (e.g. "交通", "徒步",
// "住宿" — whatever the user wants). Progress = how many rows are checked off.
// Checks are purely manual. Gear checklist stays separate.

export interface TLMedia {
  tone: string;
  uri?: string;
  thumb?: string;
  video?: boolean;
}
export interface TLRow {
  id: string;
  title: string;
  day: string;
  media?: TLMedia[];
  synth?: boolean;
  custom?: boolean;
  checked?: boolean;
}
export interface TLGroup {
  key: string;
  label: string;
  rows: TLRow[];
}
