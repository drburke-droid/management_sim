import { getCareer, seasonAt } from './career';
import type { GameState, Player, StaticData } from './types';
import { ACTIVE_MAX, MINORS_MAX, age, minSalary, perceivedFV, scoutingLevel } from './value';

export function teamPlayers(gs: GameState, teamId: number) {
  return Object.values(gs.players).filter((p) => p.team === teamId && p.level !== 'RET' && p.level !== 'FA');
}

export function activeCount(gs: GameState, teamId: number) {
  let n = 0;
  for (const p of Object.values(gs.players)) if (p.team === teamId && p.level === 'MLB' && p.injuredWeeks === 0) n++;
  return n;
}

export function minorsCount(gs: GameState, teamId: number) {
  let n = 0;
  for (const p of Object.values(gs.players)) if (p.team === teamId && p.level === 'MIN') n++;
  return n;
}

/**
 * What a manager "sees" when deciding who plays: current true ability
 * (performance in camp / AAA is observable). Used for AI roster moves and
 * auto-management, never shown to the user as a number.
 */
export function currentValue(p: Player, gs: GameState, data: StaticData) {
  const ts = seasonAt(p, age(p, gs.year), data);
  if (!ts) return -5;
  let v = 0;
  if (p.role !== 'P') v += (ts.hRate * Math.min(ts.hCap, 600)) / 600;
  if (p.role !== 'H') v += (ts.pRate * Math.min(ts.pCap, ts.isStarter ? 540 : 200)) / 27;
  return v;
}

export function log(gs: GameState, text: string, kind: 'good' | 'bad' | 'info' = 'info') {
  gs.log.push({ year: gs.year, week: gs.week, text, kind });
  if (gs.log.length > 400) gs.log.splice(0, gs.log.length - 400);
}

export function callUp(gs: GameState, p: Player): string | null {
  if (p.level !== 'MIN') return 'Player is not in the minors.';
  if (activeCount(gs, p.team) >= ACTIVE_MAX) return `Active roster is full (${ACTIVE_MAX}).`;
  p.level = 'MLB';
  if (p.contract.kind === 'minor') p.contract = { salary: minSalary(gs.year), years: 1, kind: 'pre' };
  return null;
}

export function sendDown(gs: GameState, p: Player): string | null {
  if (p.level !== 'MLB') return 'Player is not on the active roster.';
  if (minorsCount(gs, p.team) >= MINORS_MAX) return `Minor league roster is full (${MINORS_MAX}).`;
  p.level = 'MIN';
  return null;
}

/** Release: remaining guaranteed money becomes dead money. */
export function release(gs: GameState, p: Player) {
  const t = gs.teams[p.team];
  if (t && p.contract.kind !== 'minor' && p.contract.kind !== 'pre') {
    const years = Math.max(0, p.contract.years);
    if (years > 0) t.deadMoney.push({ amount: p.contract.salary, years });
  }
  p.team = -1;
  p.level = 'FA';
  p.contract = { salary: minSalary(gs.year), years: 1, kind: 'fa' };
  p.faAsk = { salary: minSalary(gs.year), years: 1 };
}

function isPitcher(p: Player) {
  return p.role === 'P';
}

/**
 * Keep an AI (or auto-managed) roster legal and sensible: fill holes from
 * the minors (then free agents), send down/release excess, keep 12-13 pitchers.
 */
export function manageRoster(gs: GameState, data: StaticData, teamId: number, opts: { allowFA: boolean }) {
  const val = (p: Player) => currentValue(p, gs, data);
  const all = teamPlayers(gs, teamId);
  const active = all.filter((p) => p.level === 'MLB' && p.injuredWeeks === 0);
  const nP = active.filter(isPitcher).length;

  // too many: send down the least valuable of the over-represented group
  let excess = active.length - ACTIVE_MAX;
  if (excess > 0) {
    const pool = active.filter((p) => (nP > 12 ? isPitcher(p) : !isPitcher(p))).sort((a, b) => val(a) - val(b));
    const pool2 = [...active].sort((a, b) => val(a) - val(b));
    for (const p of [...pool, ...pool2]) {
      if (excess <= 0) break;
      if (p.level !== 'MLB') continue;
      if (p.contract.salary > 8_000_000 && val(p) > 0) continue;
      p.level = 'MIN';
      excess--;
    }
  }

  // too few: call up (or sign) the best of the needed type
  const fas = opts.allowFA ? cheapFreeAgents(gs, data) : [];
  let need = ACTIVE_MAX - activeCount(gs, teamId);
  while (need > 0) {
    const act = teamPlayers(gs, teamId).filter((p) => p.level === 'MLB' && p.injuredWeeks === 0);
    const np = act.filter(isPitcher).length;
    const wantP = np < 12 ? true : act.length - np < 13 ? false : undefined;
    const fits = (p: Player) => wantP === undefined || isPitcher(p) === wantP;
    const mins = teamPlayers(gs, teamId).filter((p) => p.level === 'MIN' && p.injuredWeeks === 0 && fits(p));
    const bestMin = mins.sort((a, b) => val(b) - val(a))[0];
    const bestFA = fas.filter((p) => p.level === 'FA' && fits(p))[0];
    if (bestFA && (!bestMin || val(bestFA) > val(bestMin) + 0.3)) signMin(gs, bestFA, teamId);
    else if (bestMin) callUp(gs, bestMin);
    else break;
    need--;
  }

  // AI upgrade: swap a clearly better minor leaguer / cheap free agent for a weak MLB player
  if (teamId !== gs.userTeam || gs.settings.autoRoster) {
    for (let k = 0; k < 4; k++) {
      const act = teamPlayers(gs, teamId).filter((p) => p.level === 'MLB' && p.injuredWeeks === 0);
      const cands = [
        ...teamPlayers(gs, teamId).filter((p) => p.level === 'MIN' && p.injuredWeeks === 0),
        ...fas.filter((p) => p.level === 'FA').slice(0, 40),
      ];
      let best: [Player, Player, number] | null = null;
      for (const m of cands) {
        const worst = act.filter((a) => isPitcher(a) === isPitcher(m) && a.contract.salary < 5_000_000).sort((a, b) => val(a) - val(b))[0];
        if (!worst) continue;
        const gain = val(m) - val(worst);
        if (gain > 0.8 && (!best || gain > best[2])) best = [m, worst, gain];
      }
      if (!best) break;
      const [m, w] = best;
      if (minorsCount(gs, teamId) >= MINORS_MAX || (w.tid < 0 && w.contract.kind !== 'minor')) release(gs, w);
      else w.level = 'MIN';
      if (m.level === 'FA') signMin(gs, m, teamId);
      else callUp(gs, m);
    }
  }

  // minors overflow: release the lowest-graded
  const mins = teamPlayers(gs, teamId).filter((p) => p.level === 'MIN');
  if (mins.length > MINORS_MAX) {
    const lvl = scoutingLevel(gs.teams[teamId]);
    const score = (p: Player) =>
      p.hist.length || p.entryAge <= (getCareer(p, data).debutAge ?? 99)
        ? Math.max(perceivedFV(p, lvl, gs.year, data) / 10, val(p) + 4)
        : val(p) + 4;
    mins.sort((a, b) => score(a) - score(b));
    for (const p of mins.slice(0, mins.length - MINORS_MAX)) {
      if (p.contract.salary > 2_000_000) continue;
      release(gs, p);
    }
  }
}

/** Free agents who'll take (close to) the minimum, best first. */
export function cheapFreeAgents(gs: GameState, data: StaticData): Player[] {
  const cap = minSalary(gs.year) * 2;
  return Object.values(gs.players)
    .filter((p) => p.level === 'FA' && (p.faAsk?.salary ?? 0) <= cap && seasonAt(p, age(p, gs.year), data))
    .sort((a, b) => currentValue(b, gs, data) - currentValue(a, gs, data));
}

function signMin(gs: GameState, p: Player, teamId: number) {
  p.team = teamId;
  p.level = 'MLB';
  p.contract = { salary: Math.max(minSalary(gs.year), p.faAsk?.salary ?? 0), years: 1, kind: 'fa' };
  p.faAsk = undefined;
}
