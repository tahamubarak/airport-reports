import { Flight, OtpStatus, DelayBand, TimePeriod } from '../types';
import { differenceInMinutes, parseISO, getHours } from 'date-fns';

// ─── Airline name map ─────────────────────────────────────────────────────────
const AIRLINE_NAMES: Record<string, string> = {
  AA: 'American Airlines',
  UA: 'United Airlines',
  DL: 'Delta Air Lines',
  WN: 'Southwest Airlines',
  SW: 'Southwest Airlines',
  B6: 'JetBlue Airways',
  AS: 'Alaska Airlines',
  NK: 'Spirit Airlines',
  F9: 'Frontier Airlines',
  G4: 'Allegiant Air',
  HA: 'Hawaiian Airlines',
  SY: 'Sun Country Airlines',
  VX: 'Virgin America',
  MX: 'Breeze Airways',
  US: 'US Airways',
  CO: 'Continental Airlines',
  FL: 'AirTran Airways',
  YX: 'Republic Airways',
  OH: 'PSA Airlines',
  MQ: 'Envoy Air',
  OO: 'SkyWest Airlines',
  ZW: 'Air Wisconsin',
  CP: 'Compass Airlines',
  '9E': 'Endeavor Air',
  EV: 'ExpressJet',
  QX: 'Horizon Air',
  C5: 'CommutAir',
  YV: 'Mesa Airlines',
  PT: 'Piedmont Airlines',
  LF: 'Contour Airlines',
  KS: 'Peninsula Airways',
  ZL: 'Regional Express',
  XE: 'JSX',
  BA: 'British Airways',
  LH: 'Lufthansa',
  AF: 'Air France',
  KL: 'KLM',
  IB: 'Iberia',
  AZ: 'ITA Airways',
  EK: 'Emirates',
  EY: 'Etihad Airways',
  QR: 'Qatar Airways',
  SQ: 'Singapore Airlines',
  CX: 'Cathay Pacific',
  JL: 'Japan Airlines',
  NH: 'ANA',
  OZ: 'Asiana Airlines',
  KE: 'Korean Air',
  AC: 'Air Canada',
  WS: 'WestJet',
  AM: 'Aeromexico',
  'MX2': 'Mexicana',
};

function getAirlineName(linecode: string): string {
  return AIRLINE_NAMES[linecode.toUpperCase()] || linecode;
}

// ─── Computed field helpers ───────────────────────────────────────────────────

function computeOtpStatus(status: string, delayMinutes: number): OtpStatus {
  const s = status.toLowerCase();
  if (s.includes('cancel') || s.includes('cxl') || s.includes('cncl')) return 'Cancelled';
  if (delayMinutes < -2) return 'Early';
  if (delayMinutes > 15) return 'Delayed';
  return 'On Time';
}

function computeDelayBand(otpStatus: OtpStatus, delayMinutes: number): DelayBand {
  if (otpStatus === 'Cancelled') return 'Cancelled';
  if (delayMinutes <= 0) return 'On Time';
  if (delayMinutes <= 15) return '1-15 min';
  if (delayMinutes <= 30) return '16-30 min';
  if (delayMinutes <= 60) return '31-60 min';
  if (delayMinutes <= 120) return '61-120 min';
  return '120+ min';
}

function computeTimePeriod(hour: number): TimePeriod {
  if (hour < 6) return 'Early Morning (0-6)';
  if (hour < 12) return 'Morning (6-12)';
  if (hour < 18) return 'Afternoon (12-18)';
  return 'Evening (18-24)';
}

function getScheduledHour(schedule: string): number {
  if (!schedule) return 0;
  try {
    return getHours(parseISO(schedule));
  } catch {
    return 0;
  }
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function isCancelled(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes('cancel') || s.includes('cxl') || s.includes('cncl');
}

function deriveStatus(rawStatus: string, schedule: string, actual: string): string {
  if (!rawStatus && !schedule && !actual) return 'Scheduled';
  if (isCancelled(rawStatus)) return 'Cancelled';
  const s = rawStatus.toLowerCase();
  if (s.includes('on time') || s.includes('ontime')) return 'On Time';
  if (s.includes('delay') || s.includes('late')) return 'Delayed';
  if (s.includes('early') || s.includes('ahead')) return 'Early';
  if (s.includes('board') || s.includes('depart')) return 'On Time';
  if (s.includes('land') || s.includes('arriv')) return 'On Time';
  return rawStatus || 'Scheduled';
}

// ─── XML Parser ───────────────────────────────────────────────────────────────

export function parseFlightXML(xmlString: string): Flight[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    console.error('XML parse error:', parseError.textContent);
    throw new Error('Failed to parse flight XML data');
  }

  const dailyElements = doc.querySelectorAll('daily');
  const flights: Flight[] = [];

  dailyElements.forEach((daily) => {
    try {
      const adi = (daily.getAttribute('adi') || 'D') as 'A' | 'D';
      const scheduleDate = daily.getAttribute('schedule_date') || '';
      const linecode = daily.getAttribute('linecode') || '';
      const number = daily.getAttribute('number') || '';
      const siteIata = daily.getAttribute('site_iata') || '';

      const fieldMap: Record<string, string> = {};
      const fieldElements = daily.querySelectorAll('field');
      fieldElements.forEach((field) => {
        const name = field.getAttribute('name');
        const value = field.getAttribute('value');
        if (name && value !== null && value !== undefined && !fieldMap[name]) {
          fieldMap[name] = value;
        }
      });

      const schedule = fieldMap['schedule'] ?? '';
      const actual = fieldMap['actual'] ?? '';
      const rawStatus = fieldMap['status'] ?? '';

      let delayMinutes = 0;
      let normalizedStatus = deriveStatus(rawStatus, schedule, actual);

      if (schedule && actual) {
        try {
          const schedTime = parseISO(schedule);
          const actualTime = parseISO(actual);
          delayMinutes = differenceInMinutes(actualTime, schedTime);

          if (isCancelled(rawStatus)) {
            normalizedStatus = 'Cancelled';
            delayMinutes = 0;
          } else if (delayMinutes < -2) {
            normalizedStatus = 'Early';
          } else if (delayMinutes > 15) {
            normalizedStatus = 'Delayed';
          } else {
            normalizedStatus = 'On Time';
          }
        } catch {
          normalizedStatus = deriveStatus(rawStatus, '', '');
        }
      }

      const otpStatus = computeOtpStatus(normalizedStatus, delayMinutes);
      const delayBand = computeDelayBand(otpStatus, delayMinutes);
      const scheduledHour = getScheduledHour(schedule);
      const timePeriod = computeTimePeriod(scheduledHour);
      const airlineName = getAirlineName(linecode);
      const flightKey = `${linecode}${number}`;
      const gate = fieldMap['gate'] ?? '';
      const city = fieldMap['city'] ?? '';
      const searchKey = `${flightKey} ${city} ${gate}`.toLowerCase();

      flights.push({
        // Spread ALL raw API fields first so custom fields (e.g. 'line') are accessible
        ...fieldMap,
        // Known/computed fields override the raw values below
        adi,
        scheduleDate,
        linecode,
        number,
        siteIata,
        gate,
        city,
        schedule,
        actual,
        status: normalizedStatus,
        claim: fieldMap['claim'] ?? '',
        delayMinutes,
        otpStatus,
        delayBand,
        scheduledHour,
        timePeriod,
        airlineName,
        flightKey,
        searchKey,
      });
    } catch (err) {
      console.warn('Skipping malformed daily record:', err);
    }
  });

  return flights;
}

// ─── Mock data generator ──────────────────────────────────────────────────────

export function generateMockFlights(startDate: Date, endDate: Date): Flight[] {
  const airlines = [
    { code: 'AA', name: 'American Airlines' },
    { code: 'UA', name: 'United Airlines' },
    { code: 'DL', name: 'Delta Air Lines' },
    { code: 'WN', name: 'Southwest Airlines' },
    { code: 'B6', name: 'JetBlue Airways' },
    { code: 'AS', name: 'Alaska Airlines' },
    { code: 'NK', name: 'Spirit Airlines' },
    { code: 'F9', name: 'Frontier Airlines' },
    { code: 'G4', name: 'Allegiant Air' },
  ];

  const cities = ['JFK', 'LAX', 'ORD', 'DFW', 'ATL', 'SFO', 'MIA', 'BOS', 'SEA', 'DEN', 'LAS', 'MCO', 'PHX', 'IAH', 'CLT'];
  const gates = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3', 'D1', 'D2'];
  const statuses = ['On Time', 'On Time', 'On Time', 'Delayed', 'Delayed', 'Cancelled', 'Early'];

  const flights: Flight[] = [];
  let flightNum = 100;

  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    const flightCount = 40 + Math.floor(Math.random() * 30);

    for (let i = 0; i < flightCount; i++) {
      const airline = airlines[Math.floor(Math.random() * airlines.length)];
      const city = cities[Math.floor(Math.random() * cities.length)];
      const gate = gates[Math.floor(Math.random() * gates.length)];
      const adi = (Math.random() > 0.5 ? 'A' : 'D') as 'A' | 'D';
      const statusText = statuses[Math.floor(Math.random() * statuses.length)];
      const hour = 5 + Math.floor(Math.random() * 18);
      const minute = Math.floor(Math.random() * 60);
      const schedTime = new Date(current);
      schedTime.setHours(hour, minute, 0, 0);
      const schedISO = schedTime.toISOString().replace('Z', '-05:00').slice(0, 25);

      let delayMinutes = 0;
      let actualISO = schedISO;

      if (statusText === 'Delayed') {
        delayMinutes = 15 + Math.floor(Math.random() * 120);
        const actualTime = new Date(schedTime.getTime() + delayMinutes * 60000);
        actualISO = actualTime.toISOString().replace('Z', '-05:00').slice(0, 25);
      } else if (statusText === 'Early') {
        delayMinutes = -(5 + Math.floor(Math.random() * 20));
        const actualTime = new Date(schedTime.getTime() + delayMinutes * 60000);
        actualISO = actualTime.toISOString().replace('Z', '-05:00').slice(0, 25);
      } else if (statusText === 'On Time') {
        const jitter = Math.floor(Math.random() * 10) - 5;
        delayMinutes = jitter < 0 ? 0 : jitter;
        const actualTime = new Date(schedTime.getTime() + jitter * 60000);
        actualISO = actualTime.toISOString().replace('Z', '-05:00').slice(0, 25);
      }

      const otpStatus = computeOtpStatus(statusText, delayMinutes);
      const delayBand = computeDelayBand(otpStatus, delayMinutes);
      const scheduledHour = hour;
      const timePeriod = computeTimePeriod(scheduledHour);
      const flightKey = `${airline.code}${flightNum}`;
      const searchKey = `${flightKey} ${city} ${gate}`.toLowerCase();

      // ── Mock custom operational fields ──────────────────────────────────
      const extraFields: Record<string, string> = {};
      if (statusText !== 'Cancelled' && actualISO) {
        const actualMs = new Date(schedTime.getTime() + delayMinutes * 60000).getTime();
        if (adi === 'A') {
          // Taxi-in: landing → on-chocks (5–22 min)
          const taxiInMins = 5 + Math.floor(Math.random() * 17);
          const onchkMs = actualMs + taxiInMins * 60000;
          extraFields['actualtime'] = actualISO;
          extraFields['onchk'] = new Date(onchkMs).toISOString().replace('Z', '-05:00').slice(0, 25);
          // Baggage: first bag 15–35 min after landing, last bag 15–45 min after first
          const ttfbMins = 15 + Math.floor(Math.random() * 20);
          const beltMins = 15 + Math.floor(Math.random() * 30);
          const firstBagMs = actualMs + ttfbMins * 60000;
          const lastBagMs = firstBagMs + beltMins * 60000;
          extraFields['firstbag'] = new Date(firstBagMs).toISOString().replace('Z', '-05:00').slice(0, 25);
          extraFields['lastbag'] = new Date(lastBagMs).toISOString().replace('Z', '-05:00').slice(0, 25);
        } else {
          // Taxi-out: off-block → takeoff (8–30 min)
          const taxiOutMins = 8 + Math.floor(Math.random() * 22);
          const ofchkMs = actualMs - taxiOutMins * 60000;
          extraFields['ofchk'] = new Date(ofchkMs).toISOString().replace('Z', '-05:00').slice(0, 25);
          extraFields['actualtime'] = actualISO;
        }
      }

      flights.push({
        ...extraFields,
        adi,
        scheduleDate: dateStr,
        linecode: airline.code,
        number: String(flightNum++),
        siteIata: 'BWI',
        gate,
        city,
        schedule: schedISO,
        actual: statusText === 'Cancelled' ? '' : actualISO,
        status: statusText,
        claim: adi === 'A' ? `C${Math.floor(Math.random() * 5) + 1}` : '',
        delayMinutes: statusText === 'Cancelled' ? 0 : delayMinutes,
        otpStatus,
        delayBand,
        scheduledHour,
        timePeriod,
        airlineName: airline.name,
        flightKey,
        searchKey,
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return flights;
}
