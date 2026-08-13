import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

export function WeChatIcon({ size = 26, color = '#FFFFFF', accentColor = '#07C160' }: { size?: number; color?: string; accentColor?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.2 4.2C5.3 4.2 2.2 6.8 2.2 10c0 1.8 1 3.4 2.5 4.5L4 16.8l2.6-1.3c.8.2 1.7.4 2.6.4.3 0 .5 0 .8-.05a5.3 5.3 0 0 1-.25-1.6c0-3 2.9-5.4 6.45-5.4.25 0 .5 0 .75.05C16.7 6.3 13.3 4.2 9.2 4.2Z"
        fill={color}
      />
      <Path
        d="M22 14.3c0-2.6-2.6-4.7-5.8-4.7s-5.8 2.1-5.8 4.7 2.6 4.7 5.8 4.7c.7 0 1.4-.1 2-.3l1.9 1-.5-1.7c1.4-.85 2.4-2.2 2.4-3.7Z"
        fill={color}
      />
      <Circle cx={6.8} cy={9} r={0.95} fill={accentColor} />
      <Circle cx={11.4} cy={9} r={0.95} fill={accentColor} />
      <Circle cx={14.3} cy={13.4} r={0.8} fill={accentColor} />
      <Circle cx={18} cy={13.4} r={0.8} fill={accentColor} />
    </Svg>
  );
}
