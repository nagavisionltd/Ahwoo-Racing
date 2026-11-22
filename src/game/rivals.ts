import { SHIP_PROFILES } from './vehicles';

export interface RacerIdentity {
  racerId: string;
  teamName: string;
}

interface TeamRoot {
  name: string;
  code: string;
}

const TEAM_ROOTS: TeamRoot[] = [
  { name: 'KRONOS', code: 'KRN' },
  { name: 'VELTRO', code: 'VLT' },
  { name: 'SOLARIS', code: 'SLR' },
  { name: 'AETHER', code: 'ATH' },
  { name: 'OBSIDIAN', code: 'OBS' },
  { name: 'HELIOS', code: 'HLS' },
  { name: 'VALENCE', code: 'VLN' },
  { name: 'ZEPHYR', code: 'ZPH' },
  { name: 'HYPERION', code: 'HYP' },
  { name: 'MIRAGE', code: 'MRG' },
  { name: 'STRATOS', code: 'STR' },
  { name: 'MONZA', code: 'MNZ' },
  { name: 'CYGNUS', code: 'CYG' },
  { name: 'ORION', code: 'ORN' }
];

const TEAM_DIVISIONS: string[] = [
  'APEX',
  'LUXE',
  'GP',
  'CORSA',
  'WORKS',
  'SYNDICATE',
  'ATELIER',
  'DYNAMICS',
  'RACING',
  'VANGUARD'
];

const PLAYER_IDENTITIES: Record<number, RacerIdentity> = {
  0: { racerId: 'AHW-01', teamName: 'AHWOO SOVEREIGN' },
  1: { racerId: 'VLK-04', teamName: 'AERO DIVISION' },
  2: { racerId: 'NCT-09', teamName: 'APEX SYNDICATE' },
  3: { racerId: 'AUR-12', teamName: 'SKYLINE ELITE' }
};

function shuffleArray<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function getPlayerIdentity(shipId: number): RacerIdentity {
  const preset = PLAYER_IDENTITIES[shipId];
  if (preset) return preset;
  const prof = SHIP_PROFILES[shipId] || SHIP_PROFILES[0];
  return {
    racerId: `AHW-0${(prof.id % 9) + 1}`,
    teamName: prof.name
  };
}

export function generateRivalIdentities(count = 3): RacerIdentity[] {
  const roots = shuffleArray(TEAM_ROOTS);
  const divisions = shuffleArray(TEAM_DIVISIONS);
  const usedIds = new Set<string>(Object.values(PLAYER_IDENTITIES).map((p) => p.racerId));
  const usedTeams = new Set<string>();
  const results: RacerIdentity[] = [];

  for (let i = 0; i < count; i++) {
    const root = roots[i % roots.length];
    const div = divisions[i % divisions.length];
    let teamName = `${root.name} ${div}`;
    if (usedTeams.has(teamName)) {
      teamName = `${root.name} ${divisions[(i + 3) % divisions.length]}`;
    }
    usedTeams.add(teamName);

    let racerId = '';
    for (let attempt = 0; attempt < 24; attempt++) {
      const num = Math.floor(Math.random() * 88) + 11; // 11..98
      const candidate = `${root.code}-${String(num).padStart(2, '0')}`;
      if (!usedIds.has(candidate)) {
        racerId = candidate;
        break;
      }
    }
    if (!racerId) {
      racerId = `${root.code}-${String(70 + i).padStart(2, '0')}`;
    }
    usedIds.add(racerId);
    results.push({ racerId, teamName });
  }

  return results;
}
