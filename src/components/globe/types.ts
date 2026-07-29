import { Theme } from '../../theme/theme';
import { Tone } from '../../data/tones';

export interface GlobePoi {
  id: string;
  lng: number;
  lat: number;
  mine?: boolean;
  /** scenery tone — picks the marker's circular photo (with id as the seed) */
  tone?: Tone;
  /** how many journeys share this place — when >1 the pin shows a count badge */
  count?: number;
  /** real cover photo URI from a recorded journey */
  coverUri?: string;
}

export interface GlobeProps {
  theme: Theme;
  size: number;
  pois: GlobePoi[];
  activePoiId?: string | null;
  onPoiPress?: (id: string) => void;
  /** tap on the empty map background (not a marker) — used to dismiss the sheet */
  onBackgroundPress?: () => void;
  center?: { lon: number; lat: number };
  /** selected route/location to animate the native map camera toward */
  focusCoords?: [number, number][] | null;
  /** show the current-location pin at this coordinate */
  pin?: { lng: number; lat: number } | null;
}

export function poiColor(p: GlobePoi, theme: Theme): { fill: string; hollow: boolean } {
  return { fill: p.mine ? theme.trailMine : theme.accent, hollow: false };
}
