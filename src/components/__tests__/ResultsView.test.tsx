import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ResultsView } from '../ResultsView';
import { websocketService } from '../../services/websocket';
import { apiService } from '../../services/api';
import { Session } from '../../types/session';

// Mock the services
jest.mock('../../services/websocket', () => ({
  websocketService: {
    subscribeToTiming: jest.fn().mockReturnValue('timing-handler-id'),
    disconnect: jest.fn(),
    isConnected: jest.fn(),
    removeHandler: jest.fn()
  }
}));

jest.mock('../../services/api', () => ({
  apiService: {
    getSession: jest.fn()
  }
}));

// Mock session data
const mockSession: Session = {
  id: '1',
  name: 'Qualifying - Round 1',
  series: 'Formula 1',
  status: 'Running',
  date: '2024-02-20',
  description: 'First qualifying session',
  type: 'Qualifying',
  startTime: new Date(Date.now()).toISOString(),
  endTime: new Date(Date.now() + 3600000).toISOString(),
  duration: '01:00:00',
  state: 'Running',
  location: 'Silverstone',
  track: 'Silverstone Circuit',
  competitors: [
    {
      id: '44',
      startNumber: '44',
      name: 'Lewis Hamilton',
      teamName: 'Mercedes',
      className: 'F1',
      result: {
        position: 1,
        laps: 15,
        lastLapTime: { display: '1:20.486', rawMs: 80486 },
        fastestLapTime: { display: '1:20.486', rawMs: 80486 },
        finished: false
      },
      currentLapSectorTimes: {
        '1': { display: '24.500', rawMs: 24500 },
        '2': { display: '28.200', rawMs: 28200 },
        '3': { display: '27.786', rawMs: 27786 }
      }
    }
  ],
  results: [
    {
      position: 1,
      driverName: 'Lewis Hamilton',
      driverNumber: '44',
      team: 'Mercedes',
      bestLapTime: '1:20.486',
      laps: 15
    }
  ]
};

// Default props for ResultsView
const defaultProps = {
  sessionId: '1',
  isLive: true,
  onBack: jest.fn()
};

describe('ResultsView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiService.getSession as jest.Mock).mockResolvedValue(mockSession);
    (websocketService.isConnected as jest.Mock).mockReturnValue(true);
  });

  it('displays session details after loading', async () => {
    render(<ResultsView {...defaultProps} />);

    await screen.findByText(mockSession.name);
    expect(screen.getByText(mockSession.series)).toBeInTheDocument();
  });

  it('cleans up on unmount', async () => {
    const { unmount } = render(<ResultsView sessionId="1" isLive={true} onBack={() => {}} />);

    // Wait for initial session data to load
    await waitFor(() => {
      expect(screen.getByText('Qualifying - Round 1')).toBeInTheDocument();
    });

    // Simulate component unmount
    unmount();

    // Verify cleanup
    expect(websocketService.disconnect).toHaveBeenCalled();
    expect(websocketService.removeHandler).toHaveBeenCalledWith('timing-handler-id');
  });
}); 