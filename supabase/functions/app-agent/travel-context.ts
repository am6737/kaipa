// Persisted with the assistant message, independently of ephemeral device fixes.
export type TravelContext = {
  journeyId: string | null;
  origin: string | null;
  returnDestination: string | null;
  direction: 'outbound' | 'return' | 'round_trip' | null;
  preferences: string[];
  bookings: string[];
  locationDeclined: boolean;
};
