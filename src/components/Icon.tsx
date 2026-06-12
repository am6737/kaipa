// Icon.tsx — line-icon set drawn with react-native-svg, matching the prototype's
// 1.7–2px stroke iOS visual language. <Icon name=... color=... size=... />.
import React from 'react';
import Svg, { Path, Circle, Rect, Line, Polyline, Text as SvgText } from 'react-native-svg';

export type IconName =
  | 'compass'
  | 'compassN'
  | 'bag'
  | 'user'
  | 'search'
  | 'heart'
  | 'heartFill'
  | 'share'
  | 'more'
  | 'chevronL'
  | 'chevronR'
  | 'chevronDown'
  | 'arrowL'
  | 'plus'
  | 'close'
  | 'pin'
  | 'locate'
  | 'filter'
  | 'check'
  | 'bell'
  | 'camera'
  | 'edit'
  | 'trash'
  | 'upload'
  | 'gear'
  | 'route'
  | 'calendar'
  | 'photo'
  | 'sun'
  | 'moon'
  | 'system'
  | 'grid'
  | 'list'
  | 'arrowUp'
  | 'star'
  | 'starFill'
  | 'eye'
  | 'eyeOff'
  | 'flag'
  | 'play'
  | 'people';

interface Props {
  name: IconName;
  color?: string;
  size?: number;
  strokeWidth?: number;
  fill?: string;
}

export function Icon({ name, color = '#000', size = 22, strokeWidth = 1.8, fill = 'none' }: Props) {
  const s = size;
  const stroke = color;
  const common = { stroke, strokeWidth, fill, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'compass':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={9} {...common} />
          <Path d="M15.5 8.5 13 13l-4.5 2.5L11 11z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" fill={fill} />
        </Svg>
      );
    case 'compassN':
      // map-chrome compass: a faint ring + two needles (red north, dim south)
      // and a tiny "N" — matches the prototype's recenter/正北 button.
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={10} stroke={stroke} strokeWidth={1.2} opacity={0.4} fill="none" />
          <Path d="M12 4 14 12 12 11 10 12 12 4Z" fill="#FF453A" />
          <Path d="M12 20 10 12 12 13 14 12 12 20Z" fill={stroke} opacity={0.55} />
          <SvgText x={12} y={3.6} textAnchor="middle" fontSize={3.6} fontWeight="700" fill="#FF453A">N</SvgText>
        </Svg>
      );
    case 'bag':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M6 8h12l-1 12H7L6 8Z" {...common} />
          <Path d="M9 8V6a3 3 0 0 1 6 0v2" {...common} />
        </Svg>
      );
    case 'user':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Circle cx={12} cy={8} r={3.4} {...common} />
          <Path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" {...common} />
        </Svg>
      );
    case 'people':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Circle cx={9} cy={8} r={3} {...common} />
          <Path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" {...common} />
          <Path d="M16 6.5a3 3 0 0 1 0 5.5m1 1.2c2.3.5 4 2.4 4 4.8" {...common} />
        </Svg>
      );
    case 'search':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Circle cx={10.5} cy={10.5} r={6.5} {...common} />
          <Line x1={15.5} y1={15.5} x2={20} y2={20} {...common} />
        </Svg>
      );
    case 'heart':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" {...common} />
        </Svg>
      );
    case 'heartFill':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" fill={color} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    case 'share':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M12 3v12" {...common} />
          <Path d="M8 7l4-4 4 4" {...common} />
          <Path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" {...common} />
        </Svg>
      );
    case 'more':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Circle cx={5} cy={12} r={1.6} fill={color} />
          <Circle cx={12} cy={12} r={1.6} fill={color} />
          <Circle cx={19} cy={12} r={1.6} fill={color} />
        </Svg>
      );
    case 'chevronL':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Polyline points="15 5 8 12 15 19" {...common} strokeWidth={strokeWidth + 0.4} />
        </Svg>
      );
    case 'chevronR':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Polyline points="9 5 16 12 9 19" {...common} strokeWidth={strokeWidth + 0.4} />
        </Svg>
      );
    case 'chevronDown':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Polyline points="5 9 12 16 19 9" {...common} strokeWidth={strokeWidth + 0.4} />
        </Svg>
      );
    case 'arrowL':
      // long back arrow — matches the settings push-page nav bar
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M20 12H5M12 19l-7-7 7-7" {...common} strokeWidth={2} />
        </Svg>
      );
    case 'arrowUp':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Line x1={12} y1={19} x2={12} y2={5} {...common} />
          <Polyline points="6 11 12 5 18 11" {...common} />
        </Svg>
      );
    case 'plus':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Line x1={12} y1={5} x2={12} y2={19} {...common} strokeWidth={strokeWidth + 0.2} />
          <Line x1={5} y1={12} x2={19} y2={12} {...common} strokeWidth={strokeWidth + 0.2} />
        </Svg>
      );
    case 'close':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Line x1={6} y1={6} x2={18} y2={18} {...common} strokeWidth={strokeWidth + 0.2} />
          <Line x1={18} y1={6} x2={6} y2={18} {...common} strokeWidth={strokeWidth + 0.2} />
        </Svg>
      );
    case 'pin':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" {...common} />
          <Circle cx={12} cy={11} r={2.2} {...common} />
        </Svg>
      );
    case 'locate':
      // Apple-Maps style "locate me" arrow — a filled paper-plane pointing
      // up-right (matches the prototype's locate button).
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path
            d="M20.5 3.5 4 10.2c-.7.3-.7 1.3 0 1.6l6.4 2.5a1 1 0 0 1 .56.56l2.5 6.4c.3.7 1.3.7 1.6 0L21.7 4.8a.9.9 0 0 0-1.2-1.2Z"
            fill={color}
            stroke={color}
            strokeWidth={0.6}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'filter':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M4 6h16M7 12h10M10 18h4" {...common} />
        </Svg>
      );
    case 'check':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Polyline points="5 12.5 10 17.5 19 6.5" {...common} strokeWidth={strokeWidth + 0.4} />
        </Svg>
      );
    case 'bell':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" {...common} />
          <Path d="M10 19a2 2 0 0 0 4 0" {...common} />
        </Svg>
      );
    case 'camera':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" {...common} />
          <Circle cx={12} cy={13} r={3.2} {...common} />
        </Svg>
      );
    case 'edit':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M16.5 4.5l3 3L8 19l-4 1 1-4 11.5-11.5Z" {...common} />
        </Svg>
      );
    case 'trash':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" {...common} />
        </Svg>
      );
    case 'upload':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 9.5a3.5 3.5 0 0 1 .5 6.96" {...common} />
          <Path d="M12 19v-7m0 0-2.5 2.5M12 12l2.5 2.5" {...common} />
        </Svg>
      );
    case 'gear':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M7 8h10l-1 11H8L7 8Z" {...common} />
          <Path d="M9.5 8V6a2.5 2.5 0 0 1 5 0v2" {...common} />
        </Svg>
      );
    case 'route':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M6 20c0-3 3-3 3-6s-3-3-3-6 3-3 3-3" {...common} />
          <Circle cx={6} cy={20} r={2} {...common} />
          <Circle cx={9} cy={5} r={2} {...common} />
          <Path d="M14 8h6m-6 4h4m-4 4h6" {...common} />
        </Svg>
      );
    case 'calendar':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Rect x={4} y={5} width={16} height={16} rx={2.5} {...common} />
          <Path d="M4 9.5h16M8 3.5v3M16 3.5v3" {...common} />
        </Svg>
      );
    case 'photo':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Rect x={3.5} y={5.5} width={17} height={13} rx={2.5} {...common} />
          <Circle cx={9} cy={10} r={1.8} {...common} />
          <Path d="m4.5 17 4.5-4 3 2.5 3-3 4.5 4.5" {...common} />
        </Svg>
      );
    case 'sun':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={4} {...common} />
          <Path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" {...common} />
        </Svg>
      );
    case 'moon':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" {...common} />
        </Svg>
      );
    case 'system':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Path d="M12 3.5v17" stroke={color} strokeWidth={strokeWidth} />
          <Path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill={color} opacity={0.55} />
        </Svg>
      );
    case 'grid':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Rect x={4} y={4} width={7} height={7} rx={1.6} {...common} />
          <Rect x={13} y={4} width={7} height={7} rx={1.6} {...common} />
          <Rect x={4} y={13} width={7} height={7} rx={1.6} {...common} />
          <Rect x={13} y={13} width={7} height={7} rx={1.6} {...common} />
        </Svg>
      );
    case 'list':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M8 6h12M8 12h12M8 18h12" {...common} />
          <Circle cx={4} cy={6} r={1.2} fill={color} />
          <Circle cx={4} cy={12} r={1.2} fill={color} />
          <Circle cx={4} cy={18} r={1.2} fill={color} />
        </Svg>
      );
    case 'star':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M12 4l2.4 5 5.6.7-4 3.9 1 5.5L12 16.9 7 19l1-5.5-4-3.9 5.6-.7L12 4Z" {...common} />
        </Svg>
      );
    case 'starFill':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M12 4l2.4 5 5.6.7-4 3.9 1 5.5L12 16.9 7 19l1-5.5-4-3.9 5.6-.7L12 4Z" fill={color} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    case 'eye':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" {...common} />
          <Circle cx={12} cy={12} r={3} {...common} />
        </Svg>
      );
    case 'eyeOff':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M4 4l16 16" {...common} />
          <Path d="M9.5 5.8A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.6M6.5 7.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3-.5" {...common} />
        </Svg>
      );
    case 'flag':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M6 21V4M6 5h11l-2 3 2 3H6" {...common} />
        </Svg>
      );
    case 'play':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M8 5v14l11-7z" fill={color} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    default:
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={9} {...common} />
        </Svg>
      );
  }
}
