import { createContext } from 'react';

// Nested drag controls temporarily own vertical movement instead of the sheet.
export const SheetInteractionContext = createContext<((blocked: boolean) => void) | undefined>(undefined);
