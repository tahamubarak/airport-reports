import { create } from 'zustand';
import { Flight, DateRange } from '../types';
import { authService } from '../services/authService';
import { parseFlightXML, generateMockFlights } from '../utils/flightParser';
import { format, addDays } from 'date-fns';
import toast from 'react-hot-toast';
import { useSessionStore } from './useSessionStore';

export const DEFAULT_FLIGHT_DATE_RANGE: DateRange = {
  startDate: new Date(),
  endDate: addDays(new Date(), 1),
};

interface FlightStoreState {
  flights: Flight[];
  loading: boolean;
  error: string | null;
  isCorsError: boolean;
  isUsingMockData: boolean;
  lastFetched: Date | null;
  lastDateRange: DateRange | null;
  fetchFlights: (dateRange: DateRange) => Promise<void>;
  clearError: () => void;
}

export const useFlightStore = create<FlightStoreState>((set, get) => ({
  flights: [],
  loading: false,
  error: null,
  isCorsError: false,
  isUsingMockData: false,
  lastFetched: null,
  lastDateRange: null,

  fetchFlights: async (dateRange: DateRange) => {
    if (get().loading) return; // prevent concurrent fetches

    set({ loading: true, error: null, isCorsError: false, isUsingMockData: false });

    const startStr = format(dateRange.startDate, 'yyyy-MM-dd');
    const endStr   = format(dateRange.endDate,   'yyyy-MM-dd');

    try {
      const xmlData = await authService.fetchFlightData(startStr, endStr);
      const parsed  = parseFlightXML(xmlData);

      set({ flights: parsed, lastFetched: new Date(), lastDateRange: dateRange, loading: false });

      if (parsed.length === 0) {
        toast('No flights found for the selected date range.', { icon: 'ℹ️' });
      } else {
        toast.success(`Loaded ${parsed.length} flights`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';

      if (message === 'SESSION_EXPIRED') {
        toast.error('Session expired. Please log in again.', { duration: 5000 });
        useSessionStore.getState().clearSession();
        set({ loading: false });
        return;
      }

      if (message.startsWith('CORS_ERROR:')) {
        const mockFlights = generateMockFlights(dateRange.startDate, dateRange.endDate);
        set({
          flights: mockFlights,
          isCorsError: true,
          isUsingMockData: true,
          error: message.replace('CORS_ERROR: ', ''),
          lastFetched: new Date(),
          lastDateRange: dateRange,
          loading: false,
        });
        toast.error('CORS error — loading demo data instead', { duration: 5000 });
      } else {
        set({ error: message, loading: false });
        toast.error(`Failed to load flights: ${message}`);
      }
    }
  },

  clearError: () => set({ error: null, isCorsError: false }),
}));
