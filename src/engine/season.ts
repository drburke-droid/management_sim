import { seasonAt } from './career';
import { computeUsage, type Usage } from './depth';
import { accrueWeek, netOf, settleCash, starPower, updateInterest, yearEndSettlement } from './finance';
import { Rng, clamp } from './rng';
import { log, manageRoster } from './roster';
import type { GameSeason, GameState, HitLine, PitLine, Player, Series, StaticData } from './types';
import { WEEKS, age, visibleSeasons } from './value';

export const TRADE_DEADLINE_WEEK = 18;

function rngOf(gs: GameState) {
  return new Rng(gs.rngState);
}
function saveRng(gs: GameState, r: Rng) {
  gs.rngState = r.state;
}

// ---------------------------------------------------------------------------
// Schedule: 27 weeks x two 3-game series = 162 games; ~40% vs division.
// ---------------------------------------------------------------------------

export function makeSchedule(gs: GameState, rng: Rng): [number, number][][] {
  const n = gs.teams.length;
  const weeks: [number, number][][] = [];
  const homeCount = new Array(n).fill(0);
  for (let w = 0; w < WEEKS; w++) {
    const games: [number, number][] = [];
    for (let series = 0; series < 2; series++) {
      const ids = rng.shuffle([...Array(n).keys()]);
      const paired = new Set<number>();
      for (const a of ids) {
        if (paired.has(a)) continue;
        const ta = gs.teams[a];
        const open = ids.filter((b) => b !== a && !paired.has(b));
        const div = open.filter((b) => gs.teams[b].league === ta.league && gs.teams[b].division === ta.division);
        const lg = open.filter((b) => gs.teams[b].league === ta.league);
        const r = rng.next();
        const pool = r < 0.4 && div.length ? div : r < 0.85 && lg.length ? lg : open;
        const b = pool[0];
        if (b === undefined) continue;
        paired.add(a);
        paired.add(b);
        const [home, away] = homeCount[a] <= homeCount[b] ? [a, b] : [b, a];
        homeCount[home] += 3;
        for (let g = 0; g < 3; g++) games.push([home, away]);
      }
    }
    weeks.push(games);
  }
  return weeks;
}

// ---------------------------------------------------------------------------
// Injuries
// ---------------------------------------------------------------------------

export function planInjuries(gs: GameState, data: StaticData, rng: Rng) {
  for (const p of Object.values(gs.players)) {
    p.injuryPlan = undefined;
    p.injuredWeeks = 0;
    if (p.level === 'RET' || p.team < 0) continue;
    const ts = seasonAt(p, age(p, gs.year), data);
    if (!ts) continue;
    const med = clamp((gs.teams[p.team].fin.medical - 2_000_000) / 12_000_000, 0, 1);
    let len = 0;
    if (ts.avail < 0.95) len = Math.round((1 - ts.avail) * WEEKS);
    else if (rng.chance(0.12)) len = rng.int(1, 4);
    len = Math.round(len * (1.1 - 0.25 * med));
    if (len > 0) p.injuryPlan = [rng.int(0, Math.max(0, WEEKS - len)), len];
  }
}

function updateInjuries(gs: GameState) {
  for (const p of Object.values(gs.players)) {
    if (!p.injuryPlan) {
      p.injuredWeeks = 0;
      continue;
    }
    const [start, len] = p.injuryPlan;
    const wasHurt = p.injuredWeeks > 0;
    if (gs.week >= start && gs.week < start + len) {
      p.injuredWeeks = start + len - gs.week;
      if (!wasHurt && p.team === gs.userTeam && p.level === 'MLB')
        log(gs, `${p.name} placed on the injured list (${len} wk).`, 'bad');
    } else {
      if (wasHurt && p.team === gs.userTeam && p.level === 'MLB') log(gs, `${p.name} activated from the injured list.`);
      p.injuredWeeks = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Stats accrual
// ---------------------------------------------------------------------------

function currentLine(gs: GameState, p: Player): GameSeason {
  const abbr = gs.teams[p.team]?.abbr ?? 'FA';
  let g = p.hist[p.hist.length - 1];
  if (!g || g.year !== gs.year || g.team !== abbr) {
    g = { year: gs.year, age: age(p, gs.year), team: abbr };
    p.hist.push(g);
  }
  return g;
}

function addHit(g: GameSeason, src: HitLine, f: number, war: number) {
  const h = (g.hit ??= { G: 0, PA: 0, AB: 0, R: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, SB: 0, CS: 0, BB: 0, SO: 0, HBP: 0, SF: 0, OPSP: 0, WAR: 0 });
  const prevPA = h.PA;
  for (const k of ['G', 'PA', 'AB', 'R', 'H', 'D', 'T', 'HR', 'RBI', 'SB', 'CS', 'BB', 'SO', 'HBP', 'SF'] as const) h[k] += src[k] * f;
  h.G = Math.min(h.G, 162);
  h.OPSP = h.PA > 0 ? (h.OPSP * prevPA + src.OPSP * src.PA * f) / h.PA : src.OPSP;
  h.WAR += war;
}

function addPit(g: GameSeason, src: PitLine, f: number, war: number) {
  const p = (g.pit ??= { G: 0, GS: 0, OUTS: 0, W: 0, L: 0, SV: 0, H: 0, ER: 0, HR: 0, BB: 0, SO: 0, ERAP: 0, WAR: 0 });
  const prevOuts = p.OUTS;
  for (const k of ['G', 'GS', 'OUTS', 'W', 'L', 'SV', 'H', 'ER', 'HR', 'BB', 'SO'] as const) p[k] += src[k] * f;
  p.ERAP = p.OUTS > 0 ? (p.ERAP * prevOuts + src.ERAP * src.OUTS * f) / p.OUTS : src.ERAP;
  p.WAR += war;
}

function accrueStats(gs: GameState, data: StaticData, usage: Usage, gamesFrac: number) {
  for (const u of usage.hitters) {
    const p = gs.players[u.pid];
    const ts = seasonAt(p, age(p, gs.year), data);
    if (!ts?.hit || u.pa <= 0) continue;
    const pa = u.pa * gamesFrac;
    addHit(currentLine(gs, p), ts.hit, pa / Math.max(1, ts.hit.PA), (u.rate * pa) / 600);
  }
  for (const u of usage.pitchers) {
    const p = gs.players[u.pid];
    const ts = seasonAt(p, age(p, gs.year), data);
    if (!ts?.pit || u.outs <= 0) continue;
    const outs = u.outs * gamesFrac;
    addPit(currentLine(gs, p), ts.pit, outs / Math.max(1, ts.pit.OUTS), (u.war / u.outs) * outs);
  }
}

// ---------------------------------------------------------------------------
// Weekly simulation
// ---------------------------------------------------------------------------

export function lastVisibleWar(p: Player, data: StaticData) {
  const v = visibleSeasons(p, data);
  const s = v[v.length - 1];
  return (s?.hit?.WAR ?? 0) + (s?.pit?.WAR ?? 0);
}

export function strengths(usages: Usage[]) {
  const mean = usages.reduce((a, u) => a + u.war, 0) / usages.length;
  return usages.map((u) => clamp(0.5 + (u.war - mean) / 162, 0.25, 0.75));
}

export function winProb(a: number, b: number, homeA: boolean) {
  const p = (a * (1 - b)) / (a * (1 - b) + b * (1 - a));
  return clamp(p + (homeA ? 0.02 : -0.02), 0.05, 0.95);
}

export function simWeek(gs: GameState, data: StaticData) {
  if (gs.phase === 'PRESEASON') gs.phase = 'REGULAR';
  if (gs.phase !== 'REGULAR' || gs.week >= WEEKS) return;
  const rng = rngOf(gs);
  updateInjuries(gs);
  for (const t of gs.teams) {
    if (t.id !== gs.userTeam || gs.settings.autoRoster) manageRoster(gs, data, t.id, { allowFA: true });
  }
  const usages = gs.teams.map((t) => computeUsage(gs, data, t.id));
  const str = strengths(usages);
  const games = gs.schedule[gs.week];
  const played = new Array(gs.teams.length).fill(0);
  const home = new Array(gs.teams.length).fill(0);
  for (const [h, a] of games) {
    const hw = rng.chance(winProb(str[h], str[a], true));
    if (hw) {
      gs.teams[h].w++;
      gs.teams[a].l++;
    } else {
      gs.teams[a].w++;
      gs.teams[h].l++;
    }
    played[h]++;
    played[a]++;
    home[h]++;
  }
  gs.teams.forEach((t, i) => {
    accrueStats(gs, data, usages[i], played[i] / 162);
    for (const p of Object.values(gs.players)) if (p.team === t.id && p.level === 'MLB') p.weeksMLB++;
    const before = netOf(t);
    const gp = t.w + t.l;
    accrueWeek(gs, t, home[i] / 1, gp ? t.w / gp : 0.5, gp, starPower(gs, t.id, (p) => lastVisibleWar(p, data)));
    settleCash(t, before);
  });
  gs.week++;
  saveRng(gs, rng);
  if (gs.week === TRADE_DEADLINE_WEEK) log(gs, 'The trade deadline has passed.', 'info');
  if (gs.week >= WEEKS) startPostseason(gs, data);
}

// ---------------------------------------------------------------------------
// Standings & postseason (12-team format)
// ---------------------------------------------------------------------------

export function standings(gs: GameState, league: 'AL' | 'NL') {
  const pct = (t: { w: number; l: number }) => (t.w + t.l ? t.w / (t.w + t.l) : 0.5);
  return gs.teams.filter((t) => t.league === league).sort((a, b) => pct(b) - pct(a) || b.w - a.w);
}

export function playoffSeeds(gs: GameState, league: 'AL' | 'NL'): number[] {
  const all = standings(gs, league);
  const winners = (['East', 'Central', 'West'] as const).map((d) => all.find((t) => t.division === d)!);
  winners.sort((a, b) => all.indexOf(a) - all.indexOf(b));
  const wc = all.filter((t) => !winners.includes(t)).slice(0, 3);
  return [...winners, ...wc].map((t) => t.id);
}

function startPostseason(gs: GameState, data: StaticData) {
  gs.phase = 'POSTSEASON';
  gs.postseason = [];
  for (const lg of ['AL', 'NL'] as const) {
    const s = playoffSeeds(gs, lg);
    gs.postseason.push(series(`${lg} Wild Card`, s[2], s[5], 2), series(`${lg} Wild Card`, s[3], s[4], 2));
  }
  const user = gs.teams[gs.userTeam];
  const inIt = [...playoffSeeds(gs, 'AL'), ...playoffSeeds(gs, 'NL')].includes(user.id);
  log(gs, inIt ? `${user.name} clinch a postseason berth at ${user.w}-${user.l}!` : `Season over: ${user.name} finish ${user.w}-${user.l}.`, inIt ? 'good' : 'info');
  void data;
}

function series(round: string, a: number, b: number, need: number): Series {
  return { round, a, b, winsA: 0, winsB: 0, need, done: false };
}

function seriesWinner(s: Series) {
  return s.winsA >= s.need ? s.a : s.b;
}

/** Simulate the current round of the postseason. Returns true when a champion is crowned. */
export function simPostseasonRound(gs: GameState, data: StaticData): boolean {
  if (gs.phase !== 'POSTSEASON') return false;
  const rng = rngOf(gs);
  const usages = gs.teams.map((t) => computeUsage(gs, data, t.id));
  const str = strengths(usages);
  const open = gs.postseason.filter((s) => !s.done);
  for (const s of open) {
    let g = 0;
    while (s.winsA < s.need && s.winsB < s.need) {
      // higher seed (a) hosts games 1-2, 5, 7 of a series
      const homeA = s.need === 2 ? true : s.need === 3 ? [0, 1, 4].includes(g) : [0, 1, 5, 6].includes(g);
      const hostId = homeA ? s.a : s.b;
      const aWins = rng.chance(winProb(str[s.a], str[s.b], homeA));
      if (aWins) s.winsA++;
      else s.winsB++;
      g++;
      const host = gs.teams[hostId];
      const before = netOf(host);
      const gate = host.capacity * host.fin.ticketPrice * 1.8 + host.capacity * 30;
      host.fin.season.postseason += gate;
      host.fin.season.attendance += host.capacity;
      host.fin.season.homeGames += 1;
      settleCash(host, before);
    }
    s.done = true;
    const w = gs.teams[seriesWinner(s)], l = gs.teams[seriesWinner(s) === s.a ? s.b : s.a];
    if (w.id === gs.userTeam) log(gs, `${w.name} win the ${s.round} over the ${l.name} (${Math.max(s.winsA, s.winsB)}-${Math.min(s.winsA, s.winsB)}).`, 'good');
    if (l.id === gs.userTeam) log(gs, `${l.name} eliminated in the ${s.round} by the ${w.name}.`, 'bad');
  }
  // advance bracket
  const lastRound = open[0]?.round.replace(/^(AL|NL) /, '');
  if (lastRound === 'Wild Card') {
    for (const lg of ['AL', 'NL'] as const) {
      const seeds = playoffSeeds(gs, lg);
      const wc = gs.postseason.filter((s) => s.round === `${lg} Wild Card`);
      const w36 = seriesWinner(wc[0]);
      const w45 = seriesWinner(wc[1]);
      gs.postseason.push(series(`${lg} Division Series`, seeds[0], w45, 3), series(`${lg} Division Series`, seeds[1], w36, 3));
    }
  } else if (lastRound === 'Division Series') {
    for (const lg of ['AL', 'NL'] as const) {
      const ds = gs.postseason.filter((s) => s.round === `${lg} Division Series`);
      const seeds = playoffSeeds(gs, lg);
      const [x, y] = ds.map(seriesWinner).sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
      gs.postseason.push(series(`${lg} Championship Series`, x, y, 4));
    }
  } else if (lastRound === 'Championship Series') {
    const al = seriesWinner(gs.postseason.find((s) => s.round === 'AL Championship Series')!);
    const nl = seriesWinner(gs.postseason.find((s) => s.round === 'NL Championship Series')!);
    const pct = (id: number) => gs.teams[id].w / Math.max(1, gs.teams[id].w + gs.teams[id].l);
    const [a, b] = pct(al) >= pct(nl) ? [al, nl] : [nl, al];
    gs.postseason.push(series('World Series', a, b, 4));
  } else if (lastRound === 'World Series') {
    const ws = gs.postseason.find((s) => s.round === 'World Series')!;
    gs.champion = seriesWinner(ws);
    const champ = gs.teams[gs.champion];
    log(gs, `The ${champ.city} ${champ.name} win the ${gs.year} World Series!`, champ.id === gs.userTeam ? 'good' : 'info');
    saveRng(gs, rng);
    finishSeason(gs, data);
    return true;
  }
  saveRng(gs, rng);
  return false;
}

function playoffRoundsWon(gs: GameState, teamId: number) {
  let n = 0;
  for (const s of gs.postseason) {
    if (s.a !== teamId && s.b !== teamId) continue;
    n++; // made the round
    if (s.done && seriesWinner(s) === teamId) n++;
  }
  return n;
}

/** Awards, fan interest, revenue sharing and luxury tax. */
function finishSeason(gs: GameState, data: StaticData) {
  const award: GameState['awards'][number] = { year: gs.year, champ: gs.champion };
  for (const lg of ['AL', 'NL'] as const) {
    const ids = new Set(gs.teams.filter((t) => t.league === lg).map((t) => t.abbr));
    let bestH: [number, number] = [-1, -99], bestP: [number, number] = [-1, -99];
    for (const p of Object.values(gs.players)) {
      const g = p.hist.filter((h) => h.year === gs.year && ids.has(h.team));
      const hw = g.reduce((a, h) => a + (h.hit?.WAR ?? 0), 0);
      const pw = g.reduce((a, h) => a + (h.pit?.WAR ?? 0), 0);
      if (hw + pw > bestH[1]) bestH = [p.id, hw + pw];
      if (pw > bestP[1]) bestP = [p.id, pw];
    }
    if (lg === 'AL') {
      award.mvpAL = bestH[0];
      award.cyAL = bestP[0];
    } else {
      award.mvpNL = bestH[0];
      award.cyNL = bestP[0];
    }
  }
  gs.awards.push(award);
  for (const t of gs.teams) {
    const rounds = playoffRoundsWon(gs, t.id);
    updateInterest(t, gs.year, t.w / Math.max(1, t.w + t.l), rounds, gs.champion === t.id, starPower(gs, t.id, (p) => lastVisibleWar(p, data)));
  }
  yearEndSettlement(gs);
  gs.phase = 'DONE';
}
