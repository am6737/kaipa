import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { ScrollView, View } from 'react-native';

export type PagerViewProps = {
  children?: React.ReactNode;
  initialPage?: number;
  onPageSelected?: (event: { nativeEvent: { position: number } }) => void;
  style?: object;
};

export type PagerViewHandle = { setPage: (page: number) => void };
export type PagerView = PagerViewHandle;

const PagerViewCompat = forwardRef<PagerViewHandle, PagerViewProps>(function PagerViewCompat(
  { children, initialPage = 0, onPageSelected, style },
  ref,
) {
  const scrollRef = useRef<ScrollView>(null);
  useImperativeHandle(ref, () => ({
    setPage: (page) => scrollRef.current?.scrollTo({ x: page * 1, animated: true }),
  }), []);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      contentOffset={{ x: initialPage, y: 0 }}
      onMomentumScrollEnd={(event) => {
        const width = event.nativeEvent.layoutMeasurement.width || 1;
        onPageSelected?.({ nativeEvent: { position: Math.round(event.nativeEvent.contentOffset.x / width) } });
      }}
      style={style}
    >
      {React.Children.map(children, (child) => <View style={{ width: '100%' }}>{child}</View>)}
    </ScrollView>
  );
});

export default PagerViewCompat;
