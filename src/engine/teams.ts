import type { Team } from './types';

type TeamSeed = [abbr: string, city: string, name: string, league: 'AL' | 'NL', division: 'East' | 'Central' | 'West', market: number, capacity: number];

/**
 * market: relative local-revenue potential (1.0 = league average), roughly
 * tracking metro population and media footprint.
 */
export const TEAM_SEEDS: TeamSeed[] = [
  ['BAL', 'Baltimore', 'Orioles', 'AL', 'East', 0.85, 45971],
  ['BOS', 'Boston', 'Red Sox', 'AL', 'East', 1.45, 37755],
  ['NYY', 'New York', 'Yankees', 'AL', 'East', 2.2, 46537],
  ['TB', 'Tampa Bay', 'Rays', 'AL', 'East', 0.6, 25000],
  ['TOR', 'Toronto', 'Blue Jays', 'AL', 'East', 1.3, 41500],
  ['CWS', 'Chicago', 'White Sox', 'AL', 'Central', 1.15, 40615],
  ['CLE', 'Cleveland', 'Guardians', 'AL', 'Central', 0.7, 34830],
  ['DET', 'Detroit', 'Tigers', 'AL', 'Central', 0.85, 41083],
  ['KC', 'Kansas City', 'Royals', 'AL', 'Central', 0.65, 37903],
  ['MIN', 'Minnesota', 'Twins', 'AL', 'Central', 0.8, 38544],
  ['HOU', 'Houston', 'Astros', 'AL', 'West', 1.2, 41168],
  ['LAA', 'Los Angeles', 'Angels', 'AL', 'West', 1.3, 45517],
  ['ATH', 'Sacramento', 'Athletics', 'AL', 'West', 0.55, 14014],
  ['SEA', 'Seattle', 'Mariners', 'AL', 'West', 1.0, 47929],
  ['TEX', 'Texas', 'Rangers', 'AL', 'West', 1.1, 40300],
  ['ATL', 'Atlanta', 'Braves', 'NL', 'East', 1.15, 41084],
  ['MIA', 'Miami', 'Marlins', 'NL', 'East', 0.7, 36742],
  ['NYM', 'New York', 'Mets', 'NL', 'East', 1.8, 41922],
  ['PHI', 'Philadelphia', 'Phillies', 'NL', 'East', 1.25, 42792],
  ['WSH', 'Washington', 'Nationals', 'NL', 'East', 1.0, 41339],
  ['CHC', 'Chicago', 'Cubs', 'NL', 'Central', 1.45, 41649],
  ['CIN', 'Cincinnati', 'Reds', 'NL', 'Central', 0.65, 43891],
  ['MIL', 'Milwaukee', 'Brewers', 'NL', 'Central', 0.6, 41700],
  ['PIT', 'Pittsburgh', 'Pirates', 'NL', 'Central', 0.65, 38747],
  ['STL', 'St. Louis', 'Cardinals', 'NL', 'Central', 0.9, 44494],
  ['ARI', 'Arizona', 'Diamondbacks', 'NL', 'West', 0.85, 48405],
  ['COL', 'Colorado', 'Rockies', 'NL', 'West', 0.8, 46897],
  ['LAD', 'Los Angeles', 'Dodgers', 'NL', 'West', 2.0, 56000],
  ['SD', 'San Diego', 'Padres', 'NL', 'West', 0.95, 40209],
  ['SF', 'San Francisco', 'Giants', 'NL', 'West', 1.3, 41915],
];

export function teamLabel(t: Pick<Team, 'city' | 'name'>): string {
  return `${t.city} ${t.name}`;
}
