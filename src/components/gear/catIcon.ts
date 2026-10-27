// Categories are user-made rows (name + colour, no icon column), so the icon is
// picked from keywords in the name. Anything unmatched falls back to a tag.
import { Backpack, BriefcaseMedical, Compass, CookingPot, Ellipsis, Moon, Shirt, Tag, Tent, Zap, type LucideIcon } from 'lucide-react-native';

// Order matters: 急救包 must hit safety before the generic 包 of the pack row.
const RULES: Array<[RegExp, LucideIcon]> = [
  [/安全|急救|医|药/, BriefcaseMedical],
  [/庇护|帐|营地|天幕/, Tent],
  [/睡|寝/, Moon],
  [/饮食|炊|厨|食|水|炉|餐/, CookingPot],
  [/导航|地图|指南/, Compass],
  [/电子|电|灯|通讯|相机/, Zap],
  [/服|衣|鞋|袜|帽|手套|裤/, Shirt],
  [/背负|背包|包|负重/, Backpack],
  [/其他|其它|杂/, Ellipsis],
];

export function catIcon(name?: string): LucideIcon {
  if (!name) return Tag;
  return RULES.find(([pattern]) => pattern.test(name))?.[1] ?? Tag;
}
