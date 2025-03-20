import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { SessionList } from '../SessionList';
import { apiService } from '../../services/api';
import { Session } from '../../types/session';

// Mock the API service
jest.mock('../../services/api', () => ({
  apiService: {
    getSessions: jest.fn().mockResolvedValue([])
  }
}));

jest.mock('../../services/websocket', () => ({
  websocketService: {
    subscribeToTiming: jest.fn().mockReturnValue('handler-id'),
    removeHandler: jest.fn()
  }
}));

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
  competitors: [],
  results: []
};

describe('SessionList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiService.getSessions as jest.Mock).mockResolvedValue([mockSession]);
  });

  it('displays session list', async () => {
    await act(async () => {
      render(<SessionList onSessionSelect={() => {}} />);
    });

    expect(screen.getAllByText('Formula 1')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Silverstone Circuit')[0]).toBeInTheDocument();
  });

  it('calls onSessionSelect with correct parameters', async () => {
    const mockOnSelect = jest.fn();
    
    await act(async () => {
      render(<SessionList onSessionSelect={mockOnSelect} />);
    });

    expect(screen.getAllByText('Formula 1')[0]).toBeInTheDocument();
    const viewButton = screen.getByText('View Live Timing');
    
    await act(async () => {
      viewButton.click();
    });
    
    expect(mockOnSelect).toHaveBeenCalledWith('1', true);
  });

  it('displays error state when API call fails', async () => {
    (apiService.getSessions as jest.Mock).mockRejectedValueOnce(new Error('API Error'));
    
    await act(async () => {
      render(<SessionList onSessionSelect={() => {}} />);
    });
    
    expect(screen.getByText('Failed to load sessions. Please try again later.')).toBeInTheDocument();
  });

  it('refreshes sessions periodically', async () => {
    jest.useFakeTimers();
    
    await act(async () => {
      render(<SessionList onSessionSelect={() => {}} />);
    });
    
    // Wait for initial load
    expect(screen.getAllByText('Formula 1')[0]).toBeInTheDocument();
    expect(apiService.getSessions).toHaveBeenCalledTimes(1);
    
    // Fast-forward past the refresh interval (5 seconds)
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    
    expect(apiService.getSessions).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
}); 