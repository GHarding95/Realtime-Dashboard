import React from 'react';
import { render, screen } from '@testing-library/react';
import { ResultCard } from '../ResultCard';
import { Result } from '../../types/result';

describe('ResultCard', () => {
  const mockResult: Result = {
    bib: '1',
    name: 'Max Verstappen',
    teamName: 'Red Bull Racing',
    className: 'F1',
    rank: '1',
    laps: 25,
    lastLapTime: { display: '1:23.789', rawMs: 83789 },
    fastestLapTime: { display: '1:23.456', rawMs: 83456 },
    currentLapSectorTimes: {
      "1": { display: '28.123', rawMs: 28123 },
      "2": { display: '27.456', rawMs: 27456 },
      "3": { display: '27.890', rawMs: 27890 }
    },
    finished: true
  };

  it('renders driver information correctly', () => {
    render(<ResultCard result={mockResult} />);
    
    expect(screen.getByText('Max Verstappen')).toBeInTheDocument();
    expect(screen.getByText('Red Bull Racing')).toBeInTheDocument();
  });

  it('renders timing information correctly', () => {
    render(<ResultCard result={mockResult} />);
    
    expect(screen.getByText('1:23.789')).toBeInTheDocument(); // Last Lap
    expect(screen.getByText('1:23.456')).toBeInTheDocument(); // Best Lap
  });

  it('renders position and laps correctly', () => {
    render(<ResultCard result={mockResult} />);
    
    expect(screen.getByText('P1')).toBeInTheDocument();
    expect(screen.getByText('Laps: 25')).toBeInTheDocument();
  });

  it('renders sector times correctly', () => {
    render(<ResultCard result={mockResult} />);
    
    expect(screen.getByText('28.123')).toBeInTheDocument(); // S1
    expect(screen.getByText('27.456')).toBeInTheDocument(); // S2
    expect(screen.getByText('27.890')).toBeInTheDocument(); // S3
  });

  it('handles missing sector times', () => {
    const resultWithMissingSectors: Result = {
      ...mockResult,
      currentLapSectorTimes: {}
    };
    
    render(<ResultCard result={resultWithMissingSectors} />);
    
    const sectorPlaceholders = screen.getAllByText('-');
    expect(sectorPlaceholders).toHaveLength(3);
  });
}); 