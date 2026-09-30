import { seasonAt } from './career';
import type { GameState, Player, StaticData, TrueSeason } from './types';
import { age } from './value';

/*
 * Converts a roster into a season's worth of playing time and WAR.
 * Team WAR = sum over players of (true WAR rate at their current age) x
 * (playing time the depth chart gives them). Anything the roster can't cover
 * goes to replacement level (0 WAR).
 */

export const TEAM_PA = 6200;
export const TEAM_OUTS = 4350; // 1450 IP
const SLOT_PA = TEAM_PA / 9;
const SP_OUTS = 570;
const RP_OUTS = 230;

// positional adjustment in WAR per 600 PA: C 1B 2B 3B SS LF CF RF DH
const POS_ADJ = [1.1, -1.1, 0.22, 0.22, 0.66, -0.66, 0.22, -0.66, -1.54];
// penalty for playing somewhere you've never played
const OUT_OF_POS = [3.0, 0.3, 0.8, 0.8, 1.2, 0.5, 1.2, 0.5, 0];

export const SLOT_NAMES = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

function eligibleMask(mask: number) {
  let m = mask | (1 << 8);
  if (mask & (1 << 4)) m |= (1 << 2) | (1 << 3);
  if (mask & (1 << 6)) m |= (1 << 5) | (1 << 7);
  if (mask & ((1 << 3) | (1 << 0) | (1 << 5) | (1 << 7))) m |= 1 << 1;
  return m;
}

export function rateAt(ts: TrueSeason, slot: number) {
  const elig = eligibleMask(ts.posMask);
  const pen = elig & (1 << slot) ? 0 : OUT_OF_POS[slot];
  return ts.hRate + POS_ADJ[slot] - POS_ADJ[ts.pos] - pen;
}

export interface HitterUse {
  pid: number;
  slot: number | null; // starting position, null = bench
  pa: number;
  rate: number; // WAR/600 at the positions played
  war: number;
}
export interface PitcherUse {
  pid: number;
  role: 'SP' | 'RP';
  outs: number;
  war: number;
}
export interface Usage {
  hitters: HitterUse[];
  pitchers: PitcherUse[];
  war: number;
  hitWar: number;
  pitWar: number;
  replacementPA: number;
  replacementOuts: number;
}

/** 0..1 quality of the player-development budget. */
export function devLevel(gs: GameState, teamId: number) {
  const t = gs.teams[teamId];
  if (!t) return 0.5;
  return Math.max(0, Math.min(1, (t.fin.development - 3_000_000) / 22_000_000));
}

export function activePlayers(gs: GameState, teamId: number, includeInjured = false): Player[] {
  return Object.values(gs.players).filter(
    (p) => p.team === teamId && p.level === 'MLB' && (includeInjured || p.injuredWeeks === 0),
  );
}

export function computeUsage(gs: GameState, data: StaticData, teamId: number, roster?: Player[]): Usage {
  const players = roster ?? activePlayers(gs, teamId);
  const hitters: { p: Player; ts: TrueSeason }[] = [];
  const pitchers: { p: Player; ts: TrueSeason }[] = [];
  const dev = devLevel(gs, teamId);
  for (const p of players) {
    let ts = seasonAt(p, age(p, gs.year), data);
    if (!ts) continue;
    // player development staff: young players get a little better (or worse) than they did in real life
    if (age(p, gs.year) <= 26) ts = { ...ts, hRate: ts.hRate + 0.3 * dev - 0.15, pRate: ts.pRate + 0.015 * dev - 0.0075 };
    if (p.role !== 'P' && (ts.hit || ts.hCap > 0)) hitters.push({ p, ts });
    if (p.role !== 'H' && (ts.pit || ts.pCap > 0)) pitchers.push({ p, ts });
  }

  // ---- lineup: greedy assignment + pairwise swap improvement -------------
  const cands = hitters.map((h) => ({ ...h, rates: SLOT_NAMES.map((_, s) => rateAt(h.ts, s)) }));
  const assign: (number | null)[] = new Array(9).fill(null); // slot -> cand index
  const used = new Set<number>();
  const pairs: [number, number, number][] = [];
  cands.forEach((c, i) => c.rates.forEach((r, s) => pairs.push([r + c.ts.hCap / 2000, i, s])));
  pairs.sort((a, b) => b[0] - a[0]);
  for (const [, i, s] of pairs) {
    if (assign[s] !== null || used.has(i)) continue;
    assign[s] = i;
    used.add(i);
  }
  let improved = true;
  for (let iter = 0; improved && iter < 20; iter++) {
    improved = false;
    for (let a = 0; a < 9; a++)
      for (let b = a + 1; b < 9; b++) {
        const ia = assign[a], ib = assign[b];
        if (ia === null || ib === null) continue;
        const cur = cands[ia].rates[a] + cands[ib].rates[b];
        const sw = cands[ia].rates[b] + cands[ib].rates[a];
        if (sw > cur + 1e-6) {
          assign[a] = ib;
          assign[b] = ia;
          improved = true;
        }
      }
    // bench player better than a starter at that slot?
    for (let s = 0; s < 9; s++) {
      for (let i = 0; i < cands.length; i++) {
        if (used.has(i)) continue;
        const cur = assign[s];
        if (cur === null || cands[i].rates[s] > cands[cur].rates[s] + 0.3) {
          if (cur !== null) used.delete(cur);
          assign[s] = i;
          used.add(i);
          improved = true;
        }
      }
    }
  }

  const paLeft = new Map<number, number>(cands.map((c, i) => [i, c.ts.hCap]));
  const hitUse = new Map<number, HitterUse>();
  let replacementPA = 0;
  const addPA = (i: number, pa: number, rate: number, slot: number | null) => {
    const c = cands[i];
    const u = hitUse.get(i) ?? { pid: c.p.id, slot, pa: 0, rate: 0, war: 0 };
    u.war += (rate * pa) / 600;
    u.pa += pa;
    u.rate = u.pa ? (u.war / u.pa) * 600 : rate;
    if (slot !== null && u.slot === null) u.slot = slot;
    hitUse.set(i, u);
    paLeft.set(i, (paLeft.get(i) ?? 0) - pa);
  };
  for (let s = 0; s < 9; s++) {
    let need = SLOT_PA;
    const i = assign[s];
    if (i !== null) {
      const pa = Math.min(need, paLeft.get(i)!);
      addPA(i, pa, cands[i].rates[s], s);
      need -= pa;
    }
    // bench fills the gap
    const bench = cands
      .map((c, j) => ({ j, r: c.rates[s] }))
      .filter(({ j }) => !used.has(j) && (paLeft.get(j) ?? 0) > 0)
      .sort((a, b) => b.r - a.r);
    for (const { j, r } of bench) {
      if (need <= 0) break;
      if (r < -1.5) break; // a replacement-level call-up would be better
      const pa = Math.min(need, paLeft.get(j)!, 250);
      addPA(j, pa, r, null);
      need -= pa;
    }
    replacementPA += Math.max(0, need);
  }
  // bench players that got no time still appear
  cands.forEach((c, i) => {
    if (!hitUse.has(i)) hitUse.set(i, { pid: c.p.id, slot: null, pa: 0, rate: c.rates[c.ts.pos], war: 0 });
  });

  // ---- pitching staff ----------------------------------------------------
  const pc = pitchers.map((x) => ({ ...x, left: x.ts.pCap }));
  const sps = pc
    .filter((x) => x.ts.isStarter)
    .sort((a, b) => b.ts.pRate - a.ts.pRate)
    .slice(0, 5);
  // not enough starters: stretch out the best relievers
  if (sps.length < 5) {
    const extra = pc.filter((x) => !sps.includes(x)).sort((a, b) => b.ts.pRate - a.ts.pRate);
    while (sps.length < 5 && extra.length) {
      const x = extra.shift()!;
      x.left = Math.max(x.left, 300);
      sps.push(x);
    }
  }
  const pitUse: PitcherUse[] = [];
  let outsLeft = TEAM_OUTS;
  for (const x of sps) {
    const rate = x.ts.isStarter ? x.ts.pRate : x.ts.pRate - 0.03;
    const outs = Math.min(SP_OUTS, x.left);
    pitUse.push({ pid: x.p.id, role: 'SP', outs, war: (rate * outs) / 27 });
    outsLeft -= outs;
  }
  const spTarget = SP_OUTS * 5;
  const spShort = Math.max(0, spTarget - (TEAM_OUTS - outsLeft));
  let pen = TEAM_OUTS - spTarget + spShort; // bullpen covers what starters can't
  const rps = pc.filter((x) => !sps.includes(x)).sort((a, b) => b.ts.pRate - a.ts.pRate);
  for (const x of rps) {
    const cap = Math.min(x.ts.isStarter ? 300 : RP_OUTS, x.left);
    const outs = Math.max(0, Math.min(cap, pen));
    pitUse.push({ pid: x.p.id, role: 'RP', outs, war: (x.ts.pRate * outs) / 27 });
    pen -= outs;
  }
  const replacementOuts = Math.max(0, pen);

  const hitList = [...hitUse.values()];
  const hitWar = hitList.reduce((a, u) => a + u.war, 0);
  const pitWar = pitUse.reduce((a, u) => a + u.war, 0);
  return { hitters: hitList, pitchers: pitUse, war: hitWar + pitWar, hitWar, pitWar, replacementPA, replacementOuts };
}
