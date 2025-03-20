import { SessionState } from '../types/session';

export const isLiveSession = (state: SessionState): boolean => {
  return [
    'Running',
    'Red Flag',
    'Yellow Flag',
    'Safety Car',
    'Virtual Safety Car'
  ].includes(state);
};

export const isCompletedSession = (state: SessionState): boolean => {
  return ['Completed', 'Session Over', 'Finished'].includes(state);
}; 