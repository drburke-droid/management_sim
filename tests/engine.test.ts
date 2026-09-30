import { beforeAll, describe, expect, test } from 'vitest';
import { clearCareerCache, getCareer } from '../src/engine/career';
import { computeUsage } from '../src/engine/depth';
import { expenses, revenue } from '../src/engine/finance';
import { newGame } from '../src/engine/newGame';
import { advanceFreeAgency, autoDraft, beginOffseason, finishIntl, startNewSeason, DRAFT_ROUNDS } from '../src/engine/offseason';
import { activeCount } from '../src/engine/roster';
import { simPostseasonRound, simWeek } from '../src/engine/season';
import { loadTestData } from '../src/engine/testData';
import { evaluateTrade } from '../src/engine/trade';
import { H_PA, H_WAR, type GameState, type StaticData } from '../src/engine/types';
import { ACTIVE_MAX, projectWar, visibleSeasons } from '../src/engine/value';

let data: StaticData;
beforeAll(() => {
  data = loadTestData();
});

function playSeason(gs: GameState) {
  while (gs.phase !== 'POSTSEASON') simWeek(gs, data);
  while (!simPostseasonRound(gs, data));
}

function playOffseason(gs: GameState) {
  beginOffseason(gs, data);
  autoDraft(gs, data, true);
  finishIntl(gs, data);
  advanceFreeAgency(gs, data);
  advanceFreeAgency(gs, data);
  startNewSeason(gs, data);
}

describe('anonymization', () => {
  test('stats are jittered but stay within +/-12% of the real line', () => {
    const gs = newGame(data, 'NYY', 42);
    let checked = 0;
    for (const p of Object.values(gs.players)) {
      if (p.tid < 0 || p.role === 'P') continue;
      const t = data.players[p.tid];
      const c = getCareer(p, data);
      for (const row of t.hs) {
        const s = c.seasons.get(row[0]);
        if (!s?.hit || !s.real || row[H_PA] < 300 || Math.abs(row[H_WAR]) < 2) continue;
        expect(s.hit.WAR / row[H_WAR]).toBeGreaterThan(0.8);
        expect(s.hit.WAR / row[H_WAR]).toBeLessThan(1.2);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  test('new games are deterministic for a seed', () => {
    clearCareerCache();
    const a = newGame(data, 'SEA', 99);
    clearCareerCache();
    const b = newGame(data, 'SEA', 99);
    expect(Object.values(a.players).map((p) => p.name)).toEqual(Object.values(b.players).map((p) => p.name));
  });
});

describe('season', () => {
  test('162-game schedule, sensible standings and books', () => {
    const gs = newGame(data, 'SEA', 7);
    for (const t of gs.teams) expect(activeCount(gs, t.id)).toBe(ACTIVE_MAX);
    playSeason(gs);
    for (const t of gs.teams) expect(t.w + t.l).toBe(162);
    const wins = gs.teams.map((t) => t.w);
    expect(Math.max(...wins)).toBeLessThan(125);
    expect(Math.min(...wins)).toBeGreaterThan(40);
    expect(gs.champion).toBeDefined();
    const profits = gs.teams.map((t) => revenue(t.fin.season) - expenses(t.fin.season));
    const avg = profits.reduce((a, b) => a + b, 0) / profits.length;
    expect(avg).toBeGreaterThan(-50e6);
    expect(avg).toBeLessThan(150e6);
  });

  test('WAR drives winning', () => {
    const gs = newGame(data, 'SEA', 11);
    const war = gs.teams.map((t) => computeUsage(gs, data, t.id).war);
    playSeason(gs);
    const n = war.length;
    const mw = war.reduce((a, b) => a + b, 0) / n;
    const ww = gs.teams.map((t) => t.w);
    const mwin = ww.reduce((a, b) => a + b, 0) / n;
    let cov = 0, vw = 0, vx = 0;
    for (let i = 0; i < n; i++) {
      cov += (war[i] - mw) * (ww[i] - mwin);
      vw += (war[i] - mw) ** 2;
      vx += (ww[i] - mwin) ** 2;
    }
    expect(cov / Math.sqrt(vw * vx)).toBeGreaterThan(0.6);
  });
});

describe('offseason', () => {
  test('draft, international and free agency complete and rosters stay legal over 3 years', () => {
    const gs = newGame(data, 'BOS', 3);
    for (let y = 0; y < 3; y++) {
      playSeason(gs);
      beginOffseason(gs, data);
      expect(gs.phase).toBe('DRAFT');
      autoDraft(gs, data, true);
      expect(gs.draft!.log.length).toBe(DRAFT_ROUNDS * 30);
      finishIntl(gs, data);
      expect(gs.phase).toBe('FREE_AGENCY');
      advanceFreeAgency(gs, data);
      startNewSeason(gs, data);
      for (const t of gs.teams) expect(activeCount(gs, t.id)).toBeGreaterThanOrEqual(ACTIVE_MAX);
    }
    expect(gs.year).toBe(2029);
    expect(Object.values(gs.players).some((p) => p.level === 'RET')).toBe(true);
  });

  test('league talent stays roughly stable over a decade', () => {
    const gs = newGame(data, 'SEA', 777);
    const total = () => gs.teams.reduce((a, t) => a + computeUsage(gs, data, t.id).war, 0);
    const start = total();
    for (let y = 0; y < 10; y++) {
      playSeason(gs);
      playOffseason(gs);
    }
    const end = total();
    expect(end / start).toBeGreaterThan(0.6);
    expect(end / 30).toBeGreaterThan(20);
  });
});

describe('trades', () => {
  test('AI rejects lopsided deals and accepts overpays', () => {
    const gs = newGame(data, 'SEA', 5);
    const ai = 2;
    const byProj = (team: number) =>
      Object.values(gs.players)
        .filter((p) => p.team === team && p.level === 'MLB')
        .sort((a, b) => projectWar(b, gs.year, data, gs) - projectWar(a, gs.year, data, gs));
    const theirStar = byProj(ai)[0];
    const myScrub = byProj(gs.userTeam).slice(-1)[0];
    expect(evaluateTrade(gs, data, ai, [myScrub.id], [theirStar.id]).accept).toBe(false);
    const myBest = byProj(gs.userTeam).slice(0, 3).map((p) => p.id);
    const theirScrub = byProj(ai).slice(-1)[0];
    const r = evaluateTrade(gs, data, ai, myBest, [theirScrub.id]);
    expect(r.aiGain).toBeGreaterThan(0);
  });
});

describe('visibility', () => {
  test('veterans show their real pre-game history, prospects do not see the future', () => {
    const gs = newGame(data, 'SEA', 21);
    const vets = Object.values(gs.players).filter((p) => p.level === 'MLB' && p.service >= 6);
    expect(vets.every((p) => visibleSeasons(p, data).length > 0)).toBe(true);
    for (const p of Object.values(gs.players)) {
      for (const s of visibleSeasons(p, data)) expect(s.age).toBeLessThan(gs.year - p.born + 1);
    }
  });
});
