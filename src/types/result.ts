import { Time } from './session';

interface SectorTime {
  display: string;
  rawMs: number;
}

interface CurrentLapSectorTimes {
  "1"?: SectorTime;
  "2"?: SectorTime;
  "3"?: SectorTime;
}

export interface Result {
  bib: string;
  name: string;
  teamName: string;
  className: string;
  rank: string;
  laps: number;
  lastLapTime: Time;
  fastestLapTime: Time;
  currentLapSectorTimes: {
    "1"?: Time;
    "2"?: Time;
    "3"?: Time;
  };
  finished: boolean;
  currentLapTime?: {
    display: string;
    rawMs: number;
  };
}

export type MessageType = 'result' | 'session_update' | 'ping' | 'pong' | 'error' | 'connection';

export interface RawResult {
  type: MessageType;
  bib?: string;
  name?: string;
  time?: string;
  rank?: string;
  category?: string;
  club?: string;
  status?: string;
  timestamp?: string;
  finished?: boolean;
  laps?: number;
  fastestLapTime?: {
    display: string;
    rawMs: number;
  };
  lastLapTime?: {
    display: string;
    rawMs: number;
  };
  currentLapSectorTimes?: {
    [key: string]: {
      display: string;
      rawMs: number;
    };
  };
  teamName?: string;
  className?: string;
  timeRemaining?: string;
  state?: string;
  message?: string;
  error?: string;
  code?: number;
  reason?: string;
}

export interface LiveSessionData {
  timeRemaining: string;
  competitors: RawResult[];
  sessionId: string;
  series: string;
  name: string;
  track: string;
  state: string;
  startTime: string;
  duration: string;
} 