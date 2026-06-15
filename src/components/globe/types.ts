import { Theme } from '../../theme/theme';
import { JourneyStatus } from '../../data/pois';
import { Tone } from '../../data/tones';

export interface GlobePoi {
  id: string;
  lng: number;
  lat: number;
  status?: JourneyStatus;
  mine?: boolean;
  /** scenery tone — picks the marker's circular photo (with id as the seed) */
  tone?: Tone;
  /** how many journeys share this place — when >1 the pin shows a count badge
   *  (e.g. a completed trip + a 再次出发 plan at the same trailhead) */
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
  /** show the current-location pin at this coordinate */
  pin?: { lng: number; lat: number } | null;
}

export function poiColor(p: GlobePoi, theme: Theme): { fill: string; hollow: boolean } {
  if (p.status) {
    if (p.status === 'planning') return { fill: '#5FB3FF', hollow: true };
    if (p.status === 'ongoing') return { fill: theme.accent, hollow: false };
    return { fill: theme.dark ? '#9AA0A6' : '#7E7E84', hollow: false };
  }
  return { fill: p.mine ? theme.trailMine : theme.accent, hollow: false };
}
