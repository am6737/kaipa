import React, { createContext, useContext, useMemo, useState } from 'react';
import type { NativeMapStyle } from './types';

// The itinerary editor lives beside DiscoverScreen in AppRoot. Share the
// presentation so its full-screen picker opens with the route background style.
interface MapPresentation {
  mapStyle: NativeMapStyle;
  setMapStyle: React.Dispatch<React.SetStateAction<NativeMapStyle>>;
  mapLabelsVisible: boolean;
  setMapLabelsVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

const MapPresentationContext = createContext<MapPresentation | null>(null);

export function MapPresentationProvider({ children }: { children: React.ReactNode }) {
  const [mapStyle, setMapStyle] = useState<NativeMapStyle>('standard');
  const [mapLabelsVisible, setMapLabelsVisible] = useState(true);
  const value = useMemo(() => ({ mapStyle, setMapStyle, mapLabelsVisible, setMapLabelsVisible }), [mapStyle, mapLabelsVisible]);
  return <MapPresentationContext.Provider value={value}>{children}</MapPresentationContext.Provider>;
}

export function useMapPresentation() {
  const value = useContext(MapPresentationContext);
  if (!value) throw new Error('useMapPresentation requires MapPresentationProvider');
  return value;
}
