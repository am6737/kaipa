// i18n type helpers. The Chinese dictionary (zh) is the source of truth; the
// English dictionary is forced to mirror its exact shape, and translation keys
// are derived from it so a typo or a missing string is a compile error.

// A dictionary node: nested objects bottoming out in plain strings.
export type DictNode = { [k: string]: string | DictNode };

// Force a translation object to have EXACTLY the same key structure as the
// source `T`, but allow any string at the leaves (a translation differs from the
// source). Missing keys → error; extra keys → excess-property error.
export type SameShape<T> = {
  [K in keyof T]: T[K] extends string ? string : SameShape<T[K]>;
};

// The union of every dot-path that reaches a string leaf of `T`, e.g.
// 'common.save' | 'me.appearance.theme'. Used to type t()'s key argument.
export type LeafPath<T> = {
  [K in keyof T]-?: T[K] extends string
    ? `${K & string}`
    : `${K & string}.${LeafPath<T[K]>}`;
}[keyof T];
