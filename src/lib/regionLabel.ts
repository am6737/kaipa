// regionLabel.ts — 显示用的地区文字。
//
// 库里的地区用「·」分隔行政区和下面的地区（「四川 · 甘孜」），footprints、路线专题
// 等处靠它拆出省份，所以存储不动；界面上一律换成空格，不显示「·」。

export function regionLabel(region: string | null | undefined): string {
  if (!region) return '';
  return region.replace(/\s*·\s*/g, ' ').replace(/\s+/g, ' ').trim();
}
