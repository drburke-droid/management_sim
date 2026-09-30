import { getCareer } from './career';
import { clamp, seeded } from './rng';
import type { GameState, HitLine, PitLine, Player, StaticData, Team } from './types';

export const START_YEAR = 2026;
export const WEEKS = 27;
export const ACTIVE_MAX = 25;
export const MINORS_MAX = 40;
export const MINOR_SALARY = 60_000;

export function minSalary(year: number) {
  return Math.round((780_000 * Math.pow(1.02, year - START_YEAR)) / 5000) * 5000;
}

export function age(p: Player, year: number) {
  return year - p.born;
}

// ---------------------------------------------------------------------------
// Visible information: what a club can actually see about a player
// ---------------------------------------------------------------------------

export interface VisibleSeason {
  age: number;
  team?: string;
  hit?: HitLine;
  pit?: PitLine;
  pre: boolean; // happened before the game started
}

/** Seasons already played: pre-game real history (anonymized) + seasons played in this game. */
export function visibleSeasons(p: Player, data: StaticData): VisibleSeason[] {
  const out: VisibleSeason[] = [];
  if (p.tid >= 0) {
    const c = getCareer(p, data);
    for (const [a, s] of [...c.seasons.entries()].sort((x, y) => x[0] - y[0])) {
      if (a >= p.entryAge) break;
      if (!s.real) continue;
      out.push({ age: a, hit: p.role === 'P' ? undefined : s.hit, pit: p.role === 'H' ? undefined : s.pit, pre: true });
    }
  }
  for (const g of p.hist) out.push({ age: g.age, team: g.team, hit: g.hit, pit: g.pit, pre: false });
  return out;
}

/**
 * Marcel-style projection of next-season WAR using only visible seasons
 * (weights 5/4/3, regression toward a modest baseline, simple aging).
 */
export function projectWar(p: Player, year: number, data: StaticData, gs?: GameState): number {
  const seasons = visibleSeasons(p, data).filter((s) => s.age < age(p, year) + (gs && gs.phase === 'REGULAR' ? 1 : 0));
  const recent = seasons.slice(-3);
  const a = age(p, year);
  let war = 0;
  if (recent.length === 0) {
    return prospectWar(p, gs ? scoutingLevel(gs.teams[gs.userTeam]) : 0.5, year, data);
  }
  const w = [3, 4, 5].slice(-recent.length);
  if (p.role !== 'P') {
    let wWar = 0, wPA = 0;
    recent.forEach((s, i) => {
      if (s.hit) {
        wWar += s.hit.WAR * w[i];
        wPA += s.hit.PA * w[i];
      }
    });
    const reg = 1200;
    const rate = ((wWar + (1.0 / 600) * reg) / (wPA + reg)) * 600;
    const avgPA = wPA / w.reduce((x, y) => x + y, 0);
    const pa = clamp(avgPA * 1.05 + 60, 100, 650);
    war += ((rate + agingAdj(a)) * pa) / 600;
  }
  if (p.role !== 'H') {
    let wWar = 0, wOuts = 0;
    recent.forEach((s, i) => {
      if (s.pit) {
        wWar += s.pit.WAR * w[i];
        wOuts += s.pit.OUTS * w[i];
      }
    });
    const reg = 450;
    const rate = ((wWar + (0.06 / 27) * reg) / (wOuts + reg)) * 27;
    const avgOuts = wOuts / w.reduce((x, y) => x + y, 0);
    const outs = clamp(avgOuts * 1.05 + 20, 60, 600);
    war += ((rate + agingAdj(a) * 0.05) * outs) / 27;
  }
  return +war.toFixed(2);
}

function agingAdj(a: number) {
  if (a <= 24) return 0.5;
  if (a <= 26) return 0.25;
  if (a <= 29) return 0;
  if (a <= 31) return -0.3;
  if (a <= 33) return -0.5;
  return -0.8;
}

/** WAR projection for year `year + k` using visible info. */
export function projectWarAhead(p: Player, year: number, k: number, data: StaticData, gs?: GameState) {
  let w = projectWar(p, year, data, gs);
  for (let i = 1; i <= k; i++) w += agingAdj(age(p, year) + i) * (w > 0 ? 0.9 : 0.5);
  return w;
}

// ---------------------------------------------------------------------------
// Scouting grades (20-80 future value) — the fog of war around prospects
// ---------------------------------------------------------------------------

export function scoutingLevel(t: Team) {
  return clamp((t.fin.scouting - 3_000_000) / 17_000_000, 0, 1);
}

export function draftSlotGrade(overall: number) {
  return clamp(68 - 4.5 * Math.log(Math.max(1, overall)), 35, 70);
}

/** The truth: peak value the player will actually reach. Hidden. */
export function trueFV(p: Player, data: StaticData): number {
  const c = getCareer(p, data);
  if (c.debutAge === null) return clamp(33 + 3 * seeded(p.seed, 7).normal(), 25, 42);
  const vals: number[] = [];
  for (const s of c.seasons.values()) {
    if (p.role !== 'P') vals.push((s.hRate * Math.min(s.hCap, 650)) / 600);
    else vals.push((s.pRate * s.pCap) / 27);
  }
  vals.sort((a, b) => b - a);
  const top = vals.slice(0, 3);
  const peak = top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
  return clamp(40 + 5 * peak, 20, 80);
}

/** Grade as perceived by a club with the given scouting level. */
export function perceivedFV(p: Player, level: number, year: number, data: StaticData): number {
  const base = p.draftGrade ?? 45;
  const yearsIn = p.draft ? year - p.draft.year : Math.max(0, age(p, year) - 17);
  const w = clamp(0.15 + 0.25 * level + 0.12 * yearsIn, 0, 0.9);
  const sd = (7 - 3.5 * level) * (1 - w * 0.6);
  const v = (1 - w) * base + w * trueFV(p, data) + sd * p.scoutNoise;
  return Math.round(clamp(v, 20, 80) / 5) * 5;
}

export function fvToPeakWar(fv: number) {
  return (fv - 40) / 5;
}

/** Projected WAR for a player with no MLB history. */
export function prospectWar(p: Player, level: number, year: number, data: StaticData) {
  const fv = perceivedFV(p, level, year, data);
  const eta = etaYears(p, year, data);
  return +(fvToPeakWar(fv) * 0.6 - 0.35 * eta).toFixed(2);
}

/** Visible estimate of years until MLB-ready (scouts roughly know this). */
export function etaYears(p: Player, year: number, data: StaticData) {
  const c = getCareer(p, data);
  const a = age(p, year);
  if (c.debutAge === null) return Math.max(1, 25 - a);
  return Math.max(0, c.debutAge - a);
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function arbSalary(p: Player, year: number, data: StaticData, gs: GameState) {
  const arbYear = clamp(Math.floor(p.service) - 3, 0, 2);
  const pct = [0.3, 0.45, 0.65][arbYear];
  const v = Math.max(0, projectWar(p, year, data, gs)) * gs.dollarsPerWar * pct;
  return roundSalary(Math.max(minSalary(year), p.contract.salary * 1.05, v));
}

export function roundSalary(x: number) {
  if (x < 2_000_000) return Math.round(x / 5000) * 5000;
  return Math.round(x / 50_000) * 50_000;
}

/** What a free agent asks for, based on visible projection. */
export function freeAgentAsk(p: Player, year: number, data: StaticData, gs: GameState): { salary: number; years: number } {
  const a = age(p, year);
  const proj = projectWar(p, year, data, gs);
  let years = 1;
  if (proj >= 3 && a <= 29) years = 5 + (a <= 27 ? 2 : 0);
  else if (proj >= 3 && a <= 32) years = 4;
  else if (proj >= 2 && a <= 32) years = 3;
  else if (proj >= 1.2 && a <= 34) years = 2;
  let total = 0;
  for (let k = 0; k < years; k++) total += Math.max(0, projectWarAhead(p, year, k, data, gs));
  const aav = (total / years) * gs.dollarsPerWar * 1.05;
  return { salary: roundSalary(Math.max(minSalary(year), aav)), years };
}

/** Surplus value ($) of a player to a club: projected WAR value minus salary over the control window. */
export function surplusValue(p: Player, gs: GameState, data: StaticData, level = 0.5, contending = 0.5): number {
  const year = gs.year;
  const min = minSalary(year);
  const hasHistory = visibleSeasons(p, data).some((s) => (s.hit?.PA ?? 0) > 50 || (s.pit?.OUTS ?? 0) > 60);
  if (!hasHistory && p.level === 'MIN') {
    const fv = perceivedFV(p, level, year, data);
    const eta = etaYears(p, year, data);
    const perYear = Math.max(0, fvToPeakWar(fv) * 0.6);
    const v = perYear * 6 * gs.dollarsPerWar * 0.35 * Math.pow(0.88, eta);
    return v - min * 2;
  }
  let control = p.contract.years;
  if (p.contract.kind === 'pre' || p.contract.kind === 'arb' || p.contract.kind === 'minor') control = Math.max(1, 6 - Math.floor(p.service));
  control = Math.min(control, 6);
  let v = 0;
  for (let k = 0; k < control; k++) {
    const war = projectWarAhead(p, year, k, data, gs);
    let sal = p.contract.salary;
    if (p.contract.kind === 'pre' || p.contract.kind === 'minor') {
      const svc = p.service + k;
      sal = svc < 3 ? min : Math.max(min, war * gs.dollarsPerWar * [0.3, 0.45, 0.65][clamp(Math.floor(svc) - 3, 0, 2)]);
    } else if (p.contract.kind === 'arb' && k > 0) {
      const svc = p.service + k;
      sal = svc >= 6 ? war * gs.dollarsPerWar : Math.max(sal, war * gs.dollarsPerWar * [0.3, 0.45, 0.65][clamp(Math.floor(svc) - 3, 0, 2)]);
    }
    const weight = k === 0 ? 0.6 + 0.8 * contending : Math.pow(0.9, k) * (1.3 - 0.6 * contending);
    v += (war * gs.dollarsPerWar - sal) * weight;
  }
  return v;
}

export function fmtMoney(x: number, digits = 1) {
  const sign = x < 0 ? '-' : '';
  const a = Math.abs(x);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(digits)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
  return `${sign}$${a.toFixed(0)}`;
}
