import { createContext } from 'react';

/**
 * Whether the figure in a seat is the one on show. Outside a seat, always.
 *
 * Its own module so `Character` can read it without importing the stage, which
 * imports `Character`.
 */
export const SeatPresence = createContext(true);
