import React from 'react';
import { Result } from '../types/result';

interface ResultCardProps {
  result: Result;
  currentLapTime?: string;
  isLive?: boolean;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result, currentLapTime, isLive }) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Driver Information */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Driver</h3>
          <p className="text-xl font-bold">{result.name}</p>
          <p className="text-gray-600">{result.teamName}</p>
        </div>

        {/* Position and Laps */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Position</h3>
          <p className="font-medium">P{result.rank}</p>
          <p className="text-gray-600">Laps: {result.laps}</p>
        </div>

        {/* Timing Information */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Last Lap</h3>
          <p className="font-medium">{result.lastLapTime.display}</p>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">Best Lap</h3>
          <p className="font-medium">{result.fastestLapTime.display}</p>
        </div>

        {/* Current Lap Time */}
        {isLive && (
          <div className="col-span-2">
            <h3 className="text-lg font-semibold mb-2">Current Lap</h3>
            <p className="font-medium">{currentLapTime || '-'}</p>
          </div>
        )}

        {/* Sector Times */}
        <div className="col-span-2">
          <h3 className="text-lg font-semibold mb-2">Current Lap Sectors</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">S1</p>
              <p className="font-medium">{result.currentLapSectorTimes["1"]?.display || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">S2</p>
              <p className="font-medium">{result.currentLapSectorTimes["2"]?.display || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">S3</p>
              <p className="font-medium">{result.currentLapSectorTimes["3"]?.display || "-"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};