import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flight, DateRange } from '../types';
import { authService } from '../services/authService';
import { parseFlightXML, generateMockFlights } from '../utils/flightParser';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface UseFlightsReturn {
  flights: Flight[];
  loading: boolean;
  error: string | null;
  isCorsError: boolean;
  isUsingMockData: boolean;
  lastFetched: Date | null;
  fetchFlights: (dateRange: DateRange) => Promise<void>;
  clearError: () => void;
}

export function useFlights(): UseFlightsReturn {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCorsError, setIsCorsError] = useState(false);
  const [isUsingMockData, setIsUsingMockData] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();

  const fetchFlights = useCallback(async (dateRange: DateRange) => {
    // Cancel previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);
    setIsCorsError(false);
    setIsUsingMockData(false);

    const startStr = format(dateRange.startDate, 'yyyy-MM-dd');
    const endStr = format(dateRange.endDate, 'yyyy-MM-dd');

    try {
      const xmlData = await authService.fetchFlightData(startStr, endStr);
      const parsed = parseFlightXML(xmlData);
      setFlights(parsed);
      setLastFetched(new Date());

      if (parsed.length === 0) {
        toast('No flights found for the selected date range.', { icon: 'ℹ️' });
      } else {
        toast.success(`Loaded ${parsed.length} flights`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';

      if (message === 'SESSION_EXPIRED') {
        toast.error('Session expired. Please log in again.', { duration: 5000 });
        navigate('/login');
        setLoading(false);
        return;
      }

      if (message.startsWith('CORS_ERROR:')) {
        setIsCorsError(true);
        setError(message.replace('CORS_ERROR: ', ''));
        toast.error('CORS error - loading demo data instead', { duration: 5000 });

        // Fall back to mock data
        const mockFlights = generateMockFlights(dateRange.startDate, dateRange.endDate);
        setFlights(mockFlights);
        setIsUsingMockData(true);
        setLastFetched(new Date());
      } else if (message.includes('aborted') || message.includes('canceled')) {
        setLoading(false);
        return;
      } else {
        setError(message);
        toast.error(`Failed to load flights: ${message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const clearError = useCallback(() => {
    setError(null);
    setIsCorsError(false);
  }, []);

  return {
    flights,
    loading,
    error,
    isCorsError,
    isUsingMockData,
    lastFetched,
    fetchFlights,
    clearError,
  };
}
