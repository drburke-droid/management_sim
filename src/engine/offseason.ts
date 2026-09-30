import { getCareer } from './career';
import { emptyLedger, inflation, localTVValue, netOf, payrollOf, refTicketPrice, revenue, settleCash, franchiseValue } from './finance';
import { createPlayer } from './newGame';
import { Rng, clamp } from './rng';
import { log, manageRoster, release } from './roster';
import { makeSchedule, planInjuries } from './season';
import { P_AGE, P_YEAR, H_AGE, H_YEAR, type GameState, type Player, type StaticData, type Team } from './types';
import {
  MINOR_SALARY, age, arbSalary, freeAgentAsk, minSalary, perceivedFV, projectWar, roundSalary, scoutingLevel,
} from './value';

export const DRAFT_ROUNDS = 10;
export const INTL_POOL = 6_000_000;

function withRng<T>(gs: GameState, f: (r: Rng) => T): T {
  const r = new Rng(gs.rngState);
  const out = f(r);
  gs.rngState = r.state;
  return out;
}

function usedNames(gs: GameState) {
  return new Set(gs.namesUsed);
}

/**
 * Templates currently in use by a non-retired player. A career can re-enter the
 * league in a later cohort (new name, new jitter) but never twice at once.
 */
function liveTemplates(gs: GameState) {
  const s = new Set<number>();
  for (const p of Object.values(gs.players)) if (p.tid >= 0 && p.level !== 'RET') s.add(p.tid);
  return s;
}

let firstYearCache: number[] | null = null;
function firstMLBYear(data: StaticData, tid: number) {
  if (!firstYearCache) {
    firstYearCache = data.players.map((t) =>
      Math.min(...t.hs.map((r) => r[H_YEAR]), ...t.ps.map((r) => r[P_YEAR])),
    );
  }
  return firstYearCache[tid];
}
function firstAge(data: StaticData, tid: number) {
  const t = data.players[tid];
  return Math.min(...t.hs.map((r) => r[H_AGE]), ...t.ps.map((r) => r[P_AGE]));
}

export function payrollBudget(t: Team, year: number) {
  return (55_000_000 + 105_000_000 * t.market) * inflation(year) * (0.85 + t.interest / 333);
}

// ---------------------------------------------------------------------------
// 1. Retirements, service time, contracts
// ---------------------------------------------------------------------------

export function beginOffseason(gs: GameState, data: StaticData) {
  if (gs.phase !== 'DONE') return;
  withRng(gs, (rng) => {
    const next = gs.year + 1;
    for (const p of Object.values(gs.players)) {
      if (p.level === 'RET' || p.level === 'POOL') continue;
      p.injuredWeeks = 0;
      p.injuryPlan = undefined;
      // service time
      if (p.weeksMLB > 0) p.service = +(p.service + Math.min(1, (p.weeksMLB / 27) * 1.15)).toFixed(2);
      p.weeksMLB = 0;
      // retirement: the real career is over (or a never-MLB player gives up)
      const c = getCareer(p, data);
      const a = next - p.born;
      let retire = p.tid >= 0 ? a > c.lastAge : a > (p.quitAge ?? 30);
      if (!retire && p.level === 'FA' && a >= 31 && projectWar(p, gs.year, data, gs) < 0.5 && rng.chance(0.5)) retire = true;
      if (retire) {
        if (p.team === gs.userTeam) log(gs, `${p.name} (${a - 1}) has retired.`);
        p.level = 'RET';
        p.team = -1;
        p.retiredYear = gs.year;
        continue;
      }
      // contracts
      if (p.team < 0) continue;
      p.contract.years--;
      if (p.contract.years > 0) continue;
      const t = gs.teams[p.team];
      if (p.contract.kind === 'minor') {
        p.contract = { salary: MINOR_SALARY, years: 1, kind: 'minor' };
      } else if (p.service >= 6) {
        if (p.team === gs.userTeam) log(gs, `${p.name} has become a free agent.`);
        p.team = -1;
        p.level = 'FA';
      } else if (p.service >= 3) {
        const sal = arbSalary(p, next, data, gs);
        const worth = Math.max(0, projectWar(p, next, data, gs)) * gs.dollarsPerWar;
        if (t.id !== gs.userTeam && sal > Math.max(minSalary(next) * 1.5, worth * 1.1)) {
          release(gs, p);
        } else p.contract = { salary: sal, years: 1, kind: 'arb' };
      } else {
        p.contract = { salary: roundSalary(minSalary(next) + p.service * 40_000), years: 1, kind: 'pre' };
      }
    }
    for (const t of gs.teams) {
      t.deadMoney = t.deadMoney.map((d) => ({ ...d, years: d.years - 1 })).filter((d) => d.years > 0);
    }
    // prune retired players that never took the field in this game
    for (const p of Object.values(gs.players)) if (p.level === 'RET' && p.hist.length === 0) delete gs.players[p.id];
  });
  startDraft(gs, data);
}

// ---------------------------------------------------------------------------
// 2. Amateur draft (a real draft class, anonymized)
// ---------------------------------------------------------------------------

export function slotBonus(overall: number, year: number) {
  return roundSalary(Math.max(150_000, 10_500_000 * Math.exp(-0.045 * (overall - 1))) * inflation(year));
}

function startDraft(gs: GameState, data: StaticData) {
  withRng(gs, (rng) => {
    const years = Object.keys(data.drafts).map(Number).filter((y) => y >= data.firstYear && y <= data.lastYear - 11);
    let avail = years.filter((y) => !gs.usedDraftYears.includes(y));
    if (!avail.length) {
      gs.usedDraftYears = [];
      avail = years;
    }
    const src = rng.pick(avail);
    gs.usedDraftYears.push(src);
    const used = liveTemplates(gs);
    const names = usedNames(gs);
    const pool: number[] = [];
    const undrafted: number[] = [];
    for (const row of data.drafts[src]) {
      if (pool.length >= 420) {
        // deeper in the class: only the ones who reached the majors come along, as undrafted signings
        if (row[9] >= 0 && !used.has(row[9])) {
          const p = createPlayer(gs, data, rng, { tid: row[9], entryAge: row[4], draftRow: row, pos: row[3] }, names);
          p.born++;
          p.level = 'POOL';
          used.add(row[9]);
          undrafted.push(p.id);
        }
        continue;
      }
      let tid = row[9];
      if (tid >= 0 && used.has(tid)) tid = -1;
      const p = createPlayer(gs, data, rng, { tid, entryAge: row[4], draftRow: row, pos: row[3] }, names);
      p.born++; // draft-day age applies to next season
      p.level = 'POOL';
      if (tid >= 0) used.add(tid);
      pool.push(p.id);
    }
    // undrafted domestic players from the matching debut cohort
    const cohort = src + 4;
    data.players.forEach((t, tid) => {
      if (t.intl || t.dr || used.has(tid) || firstMLBYear(data, tid) !== cohort) return;
      const entry = Math.max(18, firstAge(data, tid) - rng.int(1, 3));
      const p = createPlayer(gs, data, rng, { tid, entryAge: entry }, names);
      p.born++;
      p.level = 'POOL';
      used.add(tid);
      undrafted.push(p.id);
    });
    gs.namesUsed = [...names];
    const order = [...gs.teams]
      .sort((a, b) => a.w / Math.max(1, a.w + a.l) - b.w / Math.max(1, b.w + b.l) || rng.next() - 0.5)
      .map((t) => t.id);
    gs.draft = { sourceYear: src, order, rounds: DRAFT_ROUNDS, pick: 0, pool, log: [], undrafted };
  });
  gs.phase = 'DRAFT';
  log(gs, `The ${gs.year + 1} draft is set. You pick #${gs.draft!.order.indexOf(gs.userTeam) + 1} in each round.`);
}

export function teamOnClock(gs: GameState) {
  const d = gs.draft!;
  const round = Math.floor(d.pick / d.order.length);
  const idx = d.pick % d.order.length;
  // snake-free: same order each round (like MLB)
  return { team: d.order[idx], round: round + 1, overall: d.pick + 1 };
}

export function draftPlayer(gs: GameState, data: StaticData, pid: number) {
  const d = gs.draft!;
  const { team, round, overall } = teamOnClock(gs);
  const p = gs.players[pid];
  const t = gs.teams[team];
  d.pool = d.pool.filter((x) => x !== pid);
  p.team = team;
  p.level = 'MIN';
  p.contract = { salary: MINOR_SALARY, years: 6, kind: 'minor' };
  const bonus = slotBonus(overall, gs.year);
  p.draft = { year: gs.year + 1, round, pick: overall, team: t.abbr, level: p.school ?? 'HS', bonus };
  const before = netOf(t);
  t.fin.season.bonuses += bonus;
  settleCash(t, before);
  d.log.push({ pick: overall, team, player: pid });
  d.pick++;
  if (team === gs.userTeam) log(gs, `Round ${round}, pick ${overall}: you select ${p.name} (${p.pos}).`, 'good');
  if (d.pick >= d.rounds * d.order.length) finishDraft(gs, data);
}

function aiDraftChoice(gs: GameState, data: StaticData, team: number, rng: Rng) {
  const lvl = scoutingLevel(gs.teams[team]);
  let best = -1, bestV = -Infinity;
  for (const pid of gs.draft!.pool) {
    const p = gs.players[pid];
    const v = perceivedFV(p, lvl, gs.year + 1, data) + rng.normal(0, 2) - (p.draftGrade! < 45 ? 0 : 0);
    if (v > bestV) {
      bestV = v;
      best = pid;
    }
  }
  return best;
}

/** Run AI picks until it's the user's turn (or the draft ends). */
export function autoDraft(gs: GameState, data: StaticData, includeUser = false) {
  while (gs.phase === 'DRAFT') {
    const { team } = teamOnClock(gs);
    if (team === gs.userTeam && !includeUser) return;
    const pid = withRng(gs, (rng) => aiDraftChoice(gs, data, team, rng));
    draftPlayer(gs, data, pid);
  }
}

function finishDraft(gs: GameState, data: StaticData) {
  // undrafted players who will reach the majors sign minor-league deals with random clubs
  withRng(gs, (rng) => {
    const leftovers = [...gs.draft!.pool, ...(gs.draft!.undrafted ?? [])].map((id) => gs.players[id]).filter((p) => p.tid >= 0);
    for (const p of leftovers) {
      const team = rng.int(0, gs.teams.length - 1);
      p.team = team;
      p.level = 'MIN';
      p.contract = { salary: MINOR_SALARY, years: 6, kind: 'minor' };
      p.draft = { year: gs.year + 1, round: 0, pick: 0, team: gs.teams[team].abbr, level: p.school ?? 'HS', bonus: 0 };
      if (team === gs.userTeam) log(gs, `Signed undrafted free agent ${p.name} (${p.pos}).`);
    }
    gs.draft!.pool = gs.draft!.pool.filter((id) => gs.players[id].level === 'POOL');
  });
  for (const pid of gs.draft!.pool) delete gs.players[pid];
  gs.draft!.pool = [];
  for (const t of gs.teams) manageRoster(gs, data, t.id, { allowFA: false });
  startIntl(gs, data);
}

// ---------------------------------------------------------------------------
// 3. International amateur signings
// ---------------------------------------------------------------------------

export function intlBonus(p: Player, year: number) {
  return roundSalary(clamp(300_000 * Math.exp(((p.draftGrade ?? 45) - 45) * 0.14), 100_000, 5_500_000) * inflation(year));
}

function startIntl(gs: GameState, data: StaticData) {
  withRng(gs, (rng) => {
    const used = liveTemplates(gs);
    const names = usedNames(gs);
    const cohort = (gs.usedDraftYears[gs.usedDraftYears.length - 1] ?? 1990) + 4;
    const cands: number[] = [];
    const extra: number[] = [];
    data.players.forEach((t, tid) => {
      if (!t.intl || t.dr || used.has(tid)) return;
      const first = firstAge(data, tid);
      if (first < 17 || first > 27) return;
      if (firstMLBYear(data, tid) === cohort) cands.push(tid);
      else extra.push(tid);
    });
    rng.shuffle(extra);
    while (cands.length < 30 && extra.length) cands.push(extra.pop()!);
    const pool: number[] = [];
    for (const tid of cands) {
      const p = createPlayer(gs, data, rng, { tid, entryAge: 16 + rng.int(0, 1), intl: true }, names);
      p.born++;
      p.level = 'POOL';
      pool.push(p.id);
    }
    const positions = ['P', 'P', 'P', 'SS', 'CF', 'C', '2B', '3B', 'RF', 'LF', '1B'];
    for (let i = 0; i < 20; i++) {
      const pos = rng.pick(positions);
      const p = createPlayer(gs, data, rng, { tid: -1, entryAge: 16 + rng.int(0, 1), intl: true, pos }, names);
      p.born++;
      p.level = 'POOL';
      p.quitAge = 19 + rng.int(1, 5);
      pool.push(p.id);
    }
    gs.namesUsed = [...names];
    gs.intlPool = rng.shuffle(pool);
    gs.intlSpent = {};
  });
  gs.phase = 'INTL';
}

export function signIntl(gs: GameState, pid: number, teamId = gs.userTeam): string | null {
  const p = gs.players[pid];
  const t = gs.teams[teamId];
  const bonus = intlBonus(p, gs.year + 1);
  const spent = gs.intlSpent![teamId] ?? 0;
  if (spent + bonus > INTL_POOL * inflation(gs.year)) return 'Not enough international bonus pool left.';
  gs.intlSpent![teamId] = spent + bonus;
  gs.intlPool = gs.intlPool!.filter((x) => x !== pid);
  p.team = teamId;
  p.level = 'MIN';
  p.contract = { salary: MINOR_SALARY, years: 7, kind: 'minor' };
  p.draft = { year: gs.year + 1, round: 0, pick: 0, team: t.abbr, level: 'INTL', bonus };
  const before = netOf(t);
  t.fin.season.bonuses += bonus;
  settleCash(t, before);
  if (teamId === gs.userTeam) log(gs, `Signed international amateur ${p.name} (${p.pos}, ${age(p, gs.year + 1)}) for ${(bonus / 1e6).toFixed(2)}M.`, 'good');
  return null;
}

export function finishIntl(gs: GameState, data: StaticData) {
  withRng(gs, (rng) => {
    const ai = rng.shuffle(gs.teams.filter((t) => t.id !== gs.userTeam).map((t) => t.id));
    for (let round = 0; round < 5; round++)
      for (const tid of ai) {
        const lvl = scoutingLevel(gs.teams[tid]);
        const opts = gs.intlPool!.map((pid) => gs.players[pid]).sort(
          (a, b) => perceivedFV(b, lvl, gs.year + 1, data) - perceivedFV(a, lvl, gs.year + 1, data),
        );
        for (const p of opts) if (!signIntl(gs, p.id, tid)) break;
      }
  });
  for (const pid of gs.intlPool ?? []) delete gs.players[pid];
  gs.intlPool = [];
  for (const t of gs.teams) manageRoster(gs, data, t.id, { allowFA: false });
  startFreeAgency(gs, data);
}

// ---------------------------------------------------------------------------
// 4. Free agency
// ---------------------------------------------------------------------------

function startFreeAgency(gs: GameState, data: StaticData) {
  for (const p of Object.values(gs.players)) if (p.level === 'FA') p.faAsk = freeAgentAsk(p, gs.year + 1, data, gs);
  gs.faOffers = {};
  gs.faRound = 0;
  gs.phase = 'FREE_AGENCY';
}

export function freeAgents(gs: GameState) {
  return Object.values(gs.players).filter((p) => p.level === 'FA');
}

const offerScore = (o: { salary: number; years: number }) => o.salary * (1 + 0.12 * (o.years - 1));

/** One round of bidding: every free agent picks the best offer on the table. */
export function advanceFreeAgency(gs: GameState, data: StaticData) {
  const year = gs.year + 1;
  withRng(gs, (rng) => {
    const fas = freeAgents(gs)
      .map((p) => ({ p, proj: projectWar(p, year, data, gs) }))
      .sort((a, b) => b.proj - a.proj);
    const room = new Map(gs.teams.map((t) => [t.id, payrollBudget(t, year) - payrollOf(gs, t.id, false)]));
    // weakest projected MLB player per team, split by pitchers / hitters
    const worst = new Map<string, number>();
    for (const x of Object.values(gs.players)) {
      if (x.team < 0 || x.level !== 'MLB') continue;
      const k = `${x.team}:${x.role === 'P' ? 'P' : 'H'}`;
      const v = projectWar(x, year, data, gs);
      if (!worst.has(k) || v < worst.get(k)!) worst.set(k, v);
    }
    for (const { p, proj } of fas) {
      const ask = p.faAsk ?? freeAgentAsk(p, year, data, gs);
      const offers: { team: number; salary: number; years: number }[] = [];
      for (const t of gs.teams) {
        if (t.id === gs.userTeam) continue;
        if (proj < 0.8 && rng.chance(0.8)) continue;
        const r = room.get(t.id)!;
        if (r < ask.salary && ask.salary > minSalary(year) * 2) continue;
        // does he upgrade their roster?
        if (proj < (worst.get(`${t.id}:${p.role === 'P' ? 'P' : 'H'}`) ?? -1) + 0.7) continue;
        if (!rng.chance(gs.faRound ? 0.6 : 0.35)) continue;
        offers.push({ team: t.id, salary: roundSalary(ask.salary * rng.range(0.92, 1.12)), years: ask.years });
      }
      const mine = gs.faOffers[p.id];
      if (mine) offers.push({ team: gs.userTeam, ...mine });
      const valid = offers.filter((o) => offerScore(o) >= offerScore(ask) * (gs.faRound ? 0.8 : 0.9));
      if (!valid.length) continue;
      valid.sort((a, b) => offerScore(b) - offerScore(a) || (b.team === gs.userTeam ? 1 : -1));
      const win = valid[0];
      signFA(gs, data, p, win.team, win.salary, win.years);
      room.set(win.team, (room.get(win.team) ?? 0) - win.salary);
      if (mine && win.team !== gs.userTeam) log(gs, `${p.name} spurned your offer and signed with ${gs.teams[win.team].abbr}.`, 'bad');
    }
    // the unsigned lower their demands
    for (const p of freeAgents(gs)) {
      if (!p.faAsk) continue;
      p.faAsk = { salary: roundSalary(Math.max(minSalary(year), p.faAsk.salary * 0.75)), years: Math.max(1, p.faAsk.years - 1) };
    }
    gs.faOffers = {};
    gs.faRound = (gs.faRound ?? 0) + 1;
  });
}

export function signFA(gs: GameState, data: StaticData, p: Player, teamId: number, salary: number, years: number) {
  p.team = teamId;
  p.level = 'MLB';
  p.contract = { salary, years, kind: 'fa' };
  p.faAsk = undefined;
  delete gs.faOffers[p.id];
  const t = gs.teams[teamId];
  if (teamId === gs.userTeam) log(gs, `Signed ${p.name} to ${years} yr / $${(salary / 1e6).toFixed(2)}M per year.`, 'good');
  else if (salary >= 15_000_000) log(gs, `${t.abbr} signed free agent ${p.name}: ${years} yr / $${(salary / 1e6).toFixed(1)}M.`);
  if (gs.phase === 'REGULAR' || gs.phase === 'PRESEASON') manageRoster(gs, data, teamId, { allowFA: false });
}

/** In-season (or immediate) signing: accepted if the offer meets his current ask. */
export function trySignNow(gs: GameState, data: StaticData, pid: number, salary: number, years: number): string | null {
  const p = gs.players[pid];
  const ask = p.faAsk ?? freeAgentAsk(p, gs.year, data, gs);
  if (offerScore({ salary, years }) < offerScore(ask) * 0.97) return `${p.name} wants about ${ask.years} yr / $${(ask.salary / 1e6).toFixed(2)}M.`;
  signFA(gs, data, p, gs.userTeam, salary, years);
  return null;
}

/**
 * Spring-training bargains: useful free agents still unsigned take one-year
 * deals from AI clubs they would clearly improve.
 */
function lateSignings(gs: GameState, data: StaticData) {
  const year = gs.year;
  const fas = freeAgents(gs)
    .map((p) => ({ p, proj: projectWar(p, year, data, gs) }))
    .filter((x) => x.proj >= 0.5)
    .sort((a, b) => b.proj - a.proj);
  const worst = new Map<string, { v: number; pid: number }>();
  const refresh = (teamId: number) => {
    for (const k of ['P', 'H']) worst.delete(`${teamId}:${k}`);
    for (const x of Object.values(gs.players)) {
      if (x.team !== teamId || x.level !== 'MLB') continue;
      const k = `${teamId}:${x.role === 'P' ? 'P' : 'H'}`;
      const v = projectWar(x, year, data, gs);
      if (!worst.has(k) || v < worst.get(k)!.v) worst.set(k, { v, pid: x.id });
    }
  };
  gs.teams.forEach((t) => refresh(t.id));
  for (const { p, proj } of fas) {
    let best: [number, number] | null = null;
    for (const t of gs.teams) {
      if (t.id === gs.userTeam) continue;
      const w = worst.get(`${t.id}:${p.role === 'P' ? 'P' : 'H'}`);
      const gain = proj - (w?.v ?? -1);
      if (gain > 0.6 && (!best || gain > best[1])) best = [t.id, gain];
    }
    if (!best) continue;
    const ask = p.faAsk ?? freeAgentAsk(p, year, data, gs);
    signFA(gs, data, p, best[0], roundSalary(Math.max(minSalary(year), ask.salary * 0.5)), 1);
    const w = worst.get(`${best[0]}:${p.role === 'P' ? 'P' : 'H'}`);
    if (w) gs.players[w.pid].level = 'MIN';
    refresh(best[0]);
  }
}

// ---------------------------------------------------------------------------
// 5. New season
// ---------------------------------------------------------------------------

export function startNewSeason(gs: GameState, data: StaticData) {
  const year = gs.year;
  for (const t of gs.teams) {
    const rev = revenue(t.fin.season);
    t.fin.history.push({
      year, ledger: t.fin.season, wins: t.w, losses: t.l,
      attendance: t.fin.season.attendance, value: franchiseValue(t, rev),
    });
    t.fin.season = emptyLedger();
    t.lastW = t.w;
    t.lastL = t.l;
    t.w = t.l = 0;
  }
  gs.year++;
  gs.week = 0;
  gs.champion = undefined;
  gs.postseason = [];
  gs.draft = undefined;
  gs.dollarsPerWar = Math.round(gs.dollarsPerWar * 1.03);
  withRng(gs, (rng) => {
    for (const t of gs.teams) {
      t.fin.tv.yearsLeft--;
      if (t.fin.tv.yearsLeft <= 0) {
        const old = t.fin.tv.annual;
        t.fin.tv = { annual: localTVValue(t.market, t.interest, gs.year), yearsLeft: rng.int(4, 8) };
        if (t.id === gs.userTeam)
          log(gs, `New local TV deal: $${(t.fin.tv.annual / 1e6).toFixed(1)}M/yr for ${t.fin.tv.yearsLeft} years (was $${(old / 1e6).toFixed(1)}M).`, t.fin.tv.annual >= old ? 'good' : 'bad');
      }
      if (t.id !== gs.userTeam) {
        // AI owners nudge prices toward demand
        const ref = refTicketPrice(t, gs.year);
        t.fin.ticketPrice = Math.round(ref * (0.85 + t.interest / 300));
        for (const k of ['marketing', 'scouting', 'development', 'medical'] as const) t.fin[k] = Math.round(t.fin[k] * 1.03);
      }
    }
    lateSignings(gs, data);
    for (const p of Object.values(gs.players)) {
      if (p.level === 'FA') p.faAsk = freeAgentAsk(p, gs.year, data, gs);
    }
    for (const t of gs.teams) {
      if (t.id !== gs.userTeam || gs.settings.autoRoster) manageRoster(gs, data, t.id, { allowFA: true });
    }
    gs.schedule = makeSchedule(gs, rng);
    planInjuries(gs, data, rng);
  });
  gs.phase = 'PRESEASON';
  gs.faRound = 0;
  log(gs, `Spring training ${gs.year} is underway.`);
}
