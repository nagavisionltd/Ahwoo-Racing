import type { CircuitRecord, GhostSample, RecordsSummary } from './types';

const STORAGE_KEY = 'ahwoo_circuit_records_v1';

const EMPTY_SUMMARY: RecordsSummary = {
  circuits: {},
  gpChampionships: 0,
  totalWins: 0,
  totalTakedowns: 0
};

let memoryCache: RecordsSummary | null = null;

function createEmptyCircuitRecord(circuitId: string): CircuitRecord {
  return {
    circuitId,
    bestTimeSec: null,
    bestLapSec: null,
    bestTakedowns: 0,
    bestDriftScore: 0,
    wins: 0,
    gpTrophies: 0,
    bestShipId: 0,
    ghostSamples: [],
    updatedAt: 0
  };
}

export function loadRecordsSummary(): RecordsSummary {
  if (memoryCache) return memoryCache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memoryCache = { ...EMPTY_SUMMARY, circuits: {} };
      return memoryCache;
    }
    const parsed = JSON.parse(raw) as Partial<RecordsSummary>;
    memoryCache = {
      circuits: parsed.circuits && typeof parsed.circuits === 'object' ? parsed.circuits : {},
      gpChampionships: Number(parsed.gpChampionships) || 0,
      totalWins: Number(parsed.totalWins) || 0,
      totalTakedowns: Number(parsed.totalTakedowns) || 0
    };
    return memoryCache;
  } catch {
    memoryCache = { ...EMPTY_SUMMARY, circuits: {} };
    return memoryCache;
  }
}

function persistRecords(summary: RecordsSummary): void {
  memoryCache = summary;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
  } catch {
    // If quota exceeded due to large ghost arrays, trim oldest ghosts and retry once
    try {
      const ids = Object.keys(summary.circuits).sort(
        (a, b) => (summary.circuits[a]?.updatedAt || 0) - (summary.circuits[b]?.updatedAt || 0)
      );
      if (ids.length > 1) {
        summary.circuits[ids[0]].ghostSamples = [];
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
      }
    } catch {
      // Ignore storage failures in restricted environments
    }
  }
}

export function getCircuitRecord(circuitId: string): CircuitRecord {
  const summary = loadRecordsSummary();
  return summary.circuits[circuitId] || createEmptyCircuitRecord(circuitId);
}

export interface SaveRaceOutcomeInput {
  circuitId: string;
  timeSec: number;
  bestLapSec: number | null;
  takedowns: number;
  driftScore: number;
  rank: number;
  shipId: number;
  isGrandPrixRound: boolean;
  isGrandPrixWin: boolean;
  ghostSamples: GhostSample[];
}

export interface SaveRaceOutcomeResult {
  isNewBestTime: boolean;
  isNewBestLap: boolean;
  isNewBestTakedowns: boolean;
  prevBestTimeSec: number | null;
  record: CircuitRecord;
}

export function saveRaceRecord(input: SaveRaceOutcomeInput): SaveRaceOutcomeResult {
  const summary = loadRecordsSummary();
  const prev = summary.circuits[input.circuitId] || createEmptyCircuitRecord(input.circuitId);
  const prevBestTimeSec = prev.bestTimeSec;

  const isNewBestTime =
    input.timeSec > 1 && (prev.bestTimeSec === null || input.timeSec < prev.bestTimeSec);
  const isNewBestLap =
    input.bestLapSec !== null && (prev.bestLapSec === null || input.bestLapSec < prev.bestLapSec);
  const isNewBestTakedowns = input.takedowns > prev.bestTakedowns;

  const compactGhost = isNewBestTime
    ? input.ghostSamples.slice(0, 1800).map((s) => ({
        t: Math.round(s.t * 100) / 100,
        u: Math.round(s.u * 10000) / 10000,
        x: Math.round(s.x * 100) / 100,
        airY: Math.round(s.airY * 100) / 100,
        yawOff: Math.round(s.yawOff * 1000) / 1000
      }))
    : prev.ghostSamples;

  const updated: CircuitRecord = {
    circuitId: input.circuitId,
    bestTimeSec: isNewBestTime ? input.timeSec : prev.bestTimeSec,
    bestLapSec: isNewBestLap ? input.bestLapSec : prev.bestLapSec,
    bestTakedowns: Math.max(prev.bestTakedowns, input.takedowns),
    bestDriftScore: Math.max(prev.bestDriftScore, input.driftScore),
    wins: prev.wins + (input.rank === 1 ? 1 : 0),
    gpTrophies: prev.gpTrophies + (input.isGrandPrixRound && input.rank <= 3 ? 1 : 0),
    bestShipId: isNewBestTime ? input.shipId : prev.bestShipId,
    ghostSamples: compactGhost,
    updatedAt: Date.now()
  };

  summary.circuits[input.circuitId] = updated;
  if (input.rank === 1) summary.totalWins += 1;
  summary.totalTakedowns += input.takedowns;
  if (input.isGrandPrixWin) summary.gpChampionships += 1;

  persistRecords(summary);

  return {
    isNewBestTime,
    isNewBestLap,
    isNewBestTakedowns,
    prevBestTimeSec,
    record: updated
  };
}
