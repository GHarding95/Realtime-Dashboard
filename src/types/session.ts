import { Result } from './result';

export type SessionState = 'Scheduled' | 'Running' | 'Completed' | 'Cancelled' | 'Delayed' | 'Red Flag' | 'Yellow Flag' | 'Safety Car' | 'Virtual Safety Car' | 'Checkered Flag' | 'Session Over' | 'Finished';

export interface Time {
  display: string | null;
  rawMs: number;
}

export interface CompetitorResult {
  position: number | null;
  finished: boolean;
  laps: number;
  fastestLapTime: Time;
  lastLapTime: Time;
}

export interface Competitor {
  id: string;
  startNumber: string;
  name: string;
  teamName: string;
  className: string;
  currentLapSectorTimes: {
    "1"?: { display: string; rawMs: number };
    "2"?: { display: string; rawMs: number };
    "3"?: { display: string; rawMs: number };
  };
  result: {
    position: number;
    finished: boolean;
    laps: number;
    fastestLapTime: { display: string; rawMs: number };
    lastLapTime: { display: string; rawMs: number };
  };
}

export interface Session {
  id?: string;
  sessionId?: string;
  name: string;
  status: string;
  date: string;
  location: string;
  description: string;
  type: string;
  startTime: string;
  endTime: string;
  duration: string;
  state: SessionState;
  series: string;
  track: string;
  timeRemaining?: string;
  competitors: Array<{
    id: string;
    name: string;
    startNumber: string;
    teamName: string;
    className: string;
    currentLapSectorTimes: {
      "1"?: { display: string; rawMs: number };
      "2"?: { display: string; rawMs: number };
      "3"?: { display: string; rawMs: number };
    };
    result: {
      position: number;
      finished: boolean;
      laps: number;
      fastestLapTime: { display: string; rawMs: number };
      lastLapTime: { display: string; rawMs: number };
    };
  }>;
  results?: Array<{
    position: number;
    driverName: string;
    driverNumber: string;
    team?: string;
    bestLapTime?: string;
    gap?: string;
    interval?: string;
    laps?: number;
  }>;
}