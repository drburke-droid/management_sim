import { clearCareerCache, getCareer, posIndex } from './career';
import { defaultFinance } from './finance';
import { makeName } from './names';
import { Rng, clamp } from './rng';
import { makeSchedule, planInjuries } from './season';
import { TEAM_SEEDS } from './teams';
import {
  H_AGE, H_PA, H_POS, H_YEAR, P_AGE, P_G, P_GS, P_OUTS, P_YEAR,
  type Contract, type DraftRow, type GameState, type Player, type StaticData, type Team,
} from './types';
import { START_YEAR, draftSlotGrade, freeAgentAsk, minSalary, MINOR_SALARY, projectWar, roundSalary } from './value';

const POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

export interface NewPlayerOpts {
  tid: number;
  entryAge: number;
  role?: 'H' | 'P' | 'TW';
  pos?: string;
  draftRow?: DraftRow;
  intl?: boolean;
}

/** Instantiate an anonymized player from a career template (or a never-MLB draftee when tid = -1). */
export function createPlayer(gs: GameState, data: StaticData, rng: Rng, o: NewPlayerOpts, used: Set<string>): Player {
  const t = o.tid >= 0 ? data.players[o.tid] : null;
  const id = gs.nextId++;
  let pos = o.pos ?? 'DH';
  if (t) {
    if (t.r === 'P') pos = 'P';
    else {
      // primary position = most common across the career
      const counts = new Array(9).fill(0);
      t.hs.forEach((r) => (counts[r[H_POS]] += r[H_PA]));
      pos = POS[counts.indexOf(Math.max(...counts))];
    }
  } else if (o.draftRow) {
    pos = o.draftRow[3] === 'P' ? 'P' : o.draftRow[3];
    if (!POS.includes(pos) && pos !== 'P') pos = 'CF';
  }
  const role = t ? t.r : pos === 'P' ? 'P' : 'H';
  const intl = o.intl ?? (t ? t.intl === 1 : false);
  const p: Player = {
    id,
    tid: o.tid,
    seed: rng.int(1, 2 ** 31 - 1),
    name: makeName(rng, intl, used),
    born: gs.year - o.entryAge,
    role,
    bats: t?.b ?? o.draftRow?.[5] ?? 'R',
    throws: t?.t ?? o.draftRow?.[6] ?? 'R',
    ht: clamp((t?.ht ?? o.draftRow?.[7] ?? 73) + rng.int(-1, 1), 64, 84),
    wt: clamp(Math.round((t?.wt ?? o.draftRow?.[8] ?? 195) * rng.range(0.96, 1.04)), 140, 300),
    pos,
    team: -1,
    level: 'FA',
    contract: { salary: minSalary(gs.year), years: 1, kind: 'minor' },
    service: 0,
    entryAge: o.entryAge,
    hist: [],
    weeksMLB: 0,
    injuredWeeks: 0,
    scoutNoise: clamp(rng.normal(), -2.5, 2.5),
    intl,
  };
  if (o.draftRow) {
    p.draftGrade = draftSlotGrade(o.draftRow[0]);
    p.school = o.draftRow[2];
  }
  if (!t) p.quitAge = o.entryAge + rng.int(2, 5);
  gs.players[id] = p;
  // prior MLB service = real seasons before entry
  if (t) {
    const c = getCareer(p, data);
    let svc = 0;
    for (const [a, s] of c.seasons) if (a < o.entryAge && s.real) svc += Math.min(1, ((s.hit?.G ?? 0) + (s.pit?.G ?? 0) * 3) / 100 + 0.3);
    p.service = Math.min(15, svc);
  }
  if (p.draftGrade === undefined) {
    // international / undrafted amateurs: reputation is a noisy read of talent
    p.draftGrade = clamp(45 + rng.normal(0, 6), 35, 65);
  }
  return p;
}

export function initialContract(p: Player, gs: GameState, data: StaticData, rng: Rng): Contract {
  const min = minSalary(gs.year);
  if (p.service < 3) return { salary: roundSalary(min + p.service * 40_000), years: 1, kind: 'pre' };
  const proj = Math.max(0, projectWar(p, gs.year, data, gs));
  if (p.service < 6) {
    const pct = [0.3, 0.45, 0.65][Math.floor(p.service) - 3];
    return { salary: roundSalary(Math.max(min, proj * gs.dollarsPerWar * pct)), years: 1, kind: 'arb' };
  }
  const ask = freeAgentAsk(p, gs.year, data, gs);
  // contracts signed in earlier years: some bargains, some albatrosses
  const salary = roundSalary(Math.max(min, ask.salary * rng.range(0.55, 1.1)));
  return { salary, years: rng.int(1, Math.max(1, Math.min(ask.years, 5))), kind: 'fa' };
}

interface SeasonPick {
  tid: number;
  age: number;
  pos: number;
  pa: number;
  kind: 'H' | 'SP' | 'RP';
}

function buildSeasonIndex(data: StaticData) {
  const hitters: SeasonPick[] = [];
  const sp: SeasonPick[] = [];
  const rp: SeasonPick[] = [];
  const fringeH: SeasonPick[] = [];
  const fringeP: SeasonPick[] = [];
  data.players.forEach((t, tid) => {
    if (t.r !== 'P')
      for (const r of t.hs) {
        if (r[H_YEAR] < data.firstYear) continue;
        const e = { tid, age: r[H_AGE], pos: r[H_POS], pa: r[H_PA], kind: 'H' as const };
        if (r[H_PA] >= 150) hitters.push(e);
        else if (r[H_PA] >= 30) fringeH.push(e);
      }
    if (t.r === 'P')
      for (const r of t.ps) {
        if (r[P_YEAR] < data.firstYear) continue;
        const e = { tid, age: r[P_AGE], pos: -1, pa: r[P_OUTS], kind: 'SP' as const };
        if (r[P_GS] >= 15) sp.push(e);
        else if (r[P_G] >= 25 && r[P_GS] <= 5) rp.push({ ...e, kind: 'RP' });
        else if (r[P_OUTS] >= 30) fringeP.push({ ...e, kind: r[P_GS] > r[P_G] / 2 ? 'SP' : 'RP' });
      }
  });
  return { hitters, sp, rp, fringeH, fringeP };
}

export function newGame(data: StaticData, userAbbr: string, seed = Date.now() % 2147483647): GameState {
  clearCareerCache();
  const rng = new Rng(seed);
  const teams: Team[] = TEAM_SEEDS.map(([abbr, city, name, league, division, market, capacity], id) => ({
    id, abbr, city, name, league, division, market, capacity,
    interest: Math.round(clamp(45 + (market - 1) * 20 + rng.normal(0, 8), 20, 85)),
    w: 0, l: 0, lastW: 81, lastL: 81,
    fin: defaultFinance({ market, capacity }),
    deadMoney: [],
  }));
  const gs: GameState = {
    version: 1, seed, rngState: seed, year: START_YEAR, week: 0, phase: 'PRESEASON',
    userTeam: Math.max(0, teams.findIndex((t) => t.abbr === userAbbr)),
    teams, players: {}, nextId: 1, usedTemplates: [], usedDraftYears: [], schedule: [], postseason: [],
    faOffers: {}, log: [], trades: [], awards: [], settings: { autoRoster: true }, dollarsPerWar: 9_000_000, namesUsed: [],
  };
  const used = new Set<string>();
  const usedT = new Set<number>();
  const idx = buildSeasonIndex(data);

  const draw = (pool: SeasonPick[], pred: (s: SeasonPick) => boolean = () => true): SeasonPick => {
    for (let i = 0; i < 5000; i++) {
      const s = rng.pick(pool);
      if (!usedT.has(s.tid) && pred(s)) return s;
    }
    throw new Error('season pool exhausted');
  };
  const place = (s: SeasonPick, team: number, level: 'MLB' | 'MIN' | 'FA') => {
    usedT.add(s.tid);
    const p = createPlayer(gs, data, rng, { tid: s.tid, entryAge: s.age }, used);
    p.team = level === 'FA' ? -1 : team;
    p.level = level;
    p.contract = initialContract(p, gs, data, rng);
    if (level === 'FA') p.faAsk = freeAgentAsk(p, gs.year, data, gs);
    return p;
  };

  // --- 25-man MLB rosters: 13 position players, 5 SP, 7 RP -----------------
  const regular = (pos: number) => (s: SeasonPick) => s.pos === pos && s.pa >= 350;
  const benchAt = (...pos: number[]) => (s: SeasonPick) => pos.includes(s.pos) && s.pa < 400;
  for (const t of teams) {
    for (let pos = 0; pos < 9; pos++) place(draw(idx.hitters, regular(pos)), t.id, 'MLB');
    place(draw(idx.hitters, benchAt(0)), t.id, 'MLB');
    place(draw(idx.hitters, benchAt(2, 3, 4)), t.id, 'MLB');
    place(draw(idx.hitters, benchAt(5, 6, 7)), t.id, 'MLB');
    place(draw(idx.hitters, benchAt(1, 2, 3, 4, 5, 6, 7)), t.id, 'MLB');
    for (let i = 0; i < 5; i++) place(draw(idx.sp), t.id, 'MLB');
    for (let i = 0; i < 7; i++) place(draw(idx.rp), t.id, 'MLB');
  }

  // --- minor leagues ------------------------------------------------------
  const prospects: number[] = [];
  data.players.forEach((t, tid) => {
    const first = Math.min(...t.hs.map((r) => r[H_AGE]), ...t.ps.map((r) => r[P_AGE]));
    const firstYear = Math.min(...t.hs.map((r) => r[H_YEAR]), ...t.ps.map((r) => r[P_YEAR]));
    if (firstYear >= data.firstYear + 3 && firstYear <= data.lastYear - 4 && first >= 19) prospects.push(tid);
  });
  const washouts: DraftRow[] = [];
  for (const [y, rows] of Object.entries(data.drafts)) {
    if (+y < data.firstYear || +y > data.lastYear - 10) continue;
    for (const r of rows) if (r[9] < 0 && r[1] <= 15) washouts.push(r);
  }
  for (const t of teams) {
    for (let i = 0; i < 22; i++) {
      let tid = rng.pick(prospects);
      while (usedT.has(tid)) tid = rng.pick(prospects);
      usedT.add(tid);
      const tmp = data.players[tid];
      const first = Math.min(...tmp.hs.map((r) => r[H_AGE]), ...tmp.ps.map((r) => r[P_AGE]));
      const entry = Math.max(tmp.intl ? 17 : 19, first - rng.int(1, 4));
      const dr = tmp.dr ? data.drafts[tmp.dr[0]]?.[tmp.dr[1]] : undefined;
      const p = createPlayer(gs, data, rng, { tid, entryAge: entry, draftRow: dr }, used);
      p.team = t.id;
      p.level = 'MIN';
      p.contract = { salary: MINOR_SALARY, years: 6, kind: 'minor' };
    }
    for (let i = 0; i < 3; i++) {
      const r = rng.pick(washouts);
      const p = createPlayer(gs, data, rng, { tid: -1, entryAge: r[4] + rng.int(0, 3), draftRow: r, pos: r[3] }, used);
      p.team = t.id;
      p.level = 'MIN';
      p.contract = { salary: MINOR_SALARY, years: 6, kind: 'minor' };
    }
    for (let i = 0; i < 2; i++) {
      const p = place(draw(idx.fringeH), t.id, 'MIN');
      p.contract = { salary: MINOR_SALARY * 2, years: 1, kind: 'minor' };
    }
    for (let i = 0; i < 2; i++) {
      const p = place(draw(idx.fringeP), t.id, 'MIN');
      p.contract = { salary: MINOR_SALARY * 2, years: 1, kind: 'minor' };
    }
  }

  // --- free agent pool ----------------------------------------------------
  for (let i = 0; i < 30; i++) place(draw(idx.hitters, (s) => s.pa < 450), -1, 'FA');
  for (let i = 0; i < 30; i++) place(draw(rng.chance(0.5) ? idx.sp : idx.rp), -1, 'FA');

  gs.namesUsed = [...used];
  gs.usedTemplates = [...usedT];
  gs.schedule = makeSchedule(gs, rng);
  planInjuries(gs, data, rng);
  gs.rngState = rng.state;
  const u = teams[gs.userTeam];
  gs.log.push({ year: gs.year, week: 0, text: `You have purchased the ${u.city} ${u.name}. Welcome to the owner's box.`, kind: 'good' });
  void posIndex;
  return gs;
}
