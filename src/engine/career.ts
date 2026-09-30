import { clamp, seeded, type Rng } from './rng';
import {
  H_2B, H_3B, H_AB, H_AGE, H_BB, H_CS, H_G, H_H, H_HBP, H_HR, H_MASK, H_OPSP, H_PA, H_POS, H_R, H_RBI, H_SB,
  H_SF, H_SO, H_WAR,
  P_AGE, P_BB, P_ER, P_ERAP, P_G, P_GS, P_H, P_HR, P_L, P_OUTS, P_SO, P_SV, P_W, P_WAR,
  type Career, type HitLine, type PitLine, type Player, type StaticData, type TrueSeason,
} from './types';

/*
 * A player's real career is replayed by age. The anonymization layer multiplies
 * every stat by a per-player coefficient (roughly +/-6%, capped at +/-12%) plus a
 * little per-season noise: enough to break exact stat-line lookups, not enough to
 * change what kind of player he is.
 */

const HIT_KEYS = ['R', 'H', 'D', 'T', 'HR', 'RBI', 'SB', 'CS', 'BB', 'SO', 'HBP'] as const;
const PIT_KEYS = ['W', 'L', 'SV', 'H', 'ER', 'HR', 'BB', 'SO'] as const;

const HIT_REG_PA = 200; // regression of a season's WAR rate toward the career rate
const PIT_REG_OUTS = 90;
const MAX_PA = 700;
const MAX_SP_OUTS = 650;
const MAX_RP_OUTS = 255;

interface Jitter {
  pt: number;
  war: number;
  hit: Record<string, number>;
  pit: Record<string, number>;
}

function coef(rng: Rng, sd: number, cap: number) {
  return clamp(Math.exp(rng.normal(0, sd)), 1 - cap, 1 + cap);
}

function makeJitter(seed: number): Jitter {
  const rng = seeded(seed, 1);
  const hit: Record<string, number> = {};
  const pit: Record<string, number> = {};
  for (const k of HIT_KEYS) hit[k] = coef(rng, 0.06, 0.12);
  for (const k of PIT_KEYS) pit[k] = coef(rng, 0.06, 0.12);
  return { pt: coef(rng, 0.04, 0.08), war: coef(rng, 0.06, 0.12), hit, pit };
}

const cache = new Map<number, Career>();

export function clearCareerCache() {
  cache.clear();
}

export function getCareer(p: Player, data: StaticData): Career {
  let c = cache.get(p.id);
  if (!c) {
    c = buildCareer(p, data);
    cache.set(p.id, c);
  }
  return c;
}

function hitLineFromRow(row: number[], j: Jitter, s: Rng): HitLine {
  const n = (x: number, k: string) => Math.max(0, Math.round(x * j.hit[k] * clamp(s.normal(1, 0.03), 0.93, 1.07)));
  const PA = Math.max(0, Math.round(row[H_PA] * j.pt));
  const AB = Math.min(PA, Math.round(row[H_AB] * j.pt));
  const H = Math.min(AB, n(row[H_H], 'H'));
  const D = n(row[H_2B], 'D');
  const T = n(row[H_3B], 'T');
  const HR = Math.min(n(row[H_HR], 'HR'), Math.max(0, H - D - T));
  return {
    G: Math.max(1, Math.round(row[H_G] * j.pt)), PA, AB, R: n(row[H_R], 'R'), H, D, T, HR, RBI: n(row[H_RBI], 'RBI'),
    SB: n(row[H_SB], 'SB'), CS: n(row[H_CS], 'CS'), BB: n(row[H_BB], 'BB'), SO: n(row[H_SO], 'SO'),
    HBP: n(row[H_HBP], 'HBP'), SF: Math.round(row[H_SF] * j.pt),
    OPSP: Math.round(row[H_OPSP] * clamp(s.normal(1, 0.03), 0.92, 1.08)),
    WAR: +(row[H_WAR] * j.war * clamp(s.normal(1, 0.03), 0.93, 1.07)).toFixed(1),
  };
}

function pitLineFromRow(row: number[], j: Jitter, s: Rng): PitLine {
  const n = (x: number, k: string) => Math.max(0, Math.round(x * j.pit[k] * clamp(s.normal(1, 0.03), 0.93, 1.07)));
  const G = Math.max(1, Math.round(row[P_G] * j.pt));
  const OUTS = Math.max(1, Math.round(row[P_OUTS] * j.pt));
  const erIn = row[P_ER] * (OUTS / Math.max(1, row[P_OUTS]));
  return {
    G, GS: Math.min(G, Math.round(row[P_GS] * j.pt)), OUTS, W: n(row[P_W], 'W'), L: n(row[P_L], 'L'),
    SV: n(row[P_SV], 'SV'), H: n(row[P_H], 'H'), ER: n(erIn, 'ER'), HR: n(row[P_HR], 'HR'), BB: n(row[P_BB], 'BB'),
    SO: n(row[P_SO], 'SO'), ERAP: Math.round(row[P_ERAP] * clamp(s.normal(1, 0.03), 0.92, 1.08)),
    WAR: +(row[P_WAR] * j.war * clamp(s.normal(1, 0.03), 0.93, 1.07)).toFixed(1),
  };
}

function scaleHit(l: HitLine, f: number, quality = 1): HitLine {
  const q = (x: number) => Math.round(x * f * quality);
  const PA = Math.round(l.PA * f);
  const AB = Math.min(PA, Math.round(l.AB * f));
  const H = Math.min(AB, q(l.H));
  return {
    G: Math.max(1, Math.round(l.G * f)), PA, AB, R: q(l.R), H, D: q(l.D), T: q(l.T), HR: Math.min(q(l.HR), H),
    RBI: q(l.RBI), SB: Math.round(l.SB * f), CS: Math.round(l.CS * f), BB: q(l.BB),
    SO: Math.round((l.SO * f) / quality), HBP: Math.round(l.HBP * f), SF: Math.round(l.SF * f),
    OPSP: Math.round(l.OPSP * (1 + (quality - 1) * 2.2)), WAR: +(l.WAR * f).toFixed(1),
  };
}

function scalePit(l: PitLine, f: number, quality = 1): PitLine {
  const r = (x: number) => Math.round(x * f);
  return {
    G: Math.max(1, r(l.G)), GS: r(l.GS), OUTS: Math.max(1, r(l.OUTS)), W: Math.round(l.W * f * quality),
    L: Math.round((l.L * f) / quality), SV: r(l.SV), H: Math.round((l.H * f) / quality), ER: Math.round((l.ER * f) / quality),
    HR: Math.round((l.HR * f) / quality), BB: Math.round((l.BB * f) / quality), SO: Math.round(l.SO * f * quality),
    ERAP: Math.round(l.ERAP * (1 + (quality - 1) * 2)), WAR: +(l.WAR * f).toFixed(1),
  };
}

const GENERIC_HIT: HitLine = {
  G: 100, PA: 400, AB: 362, R: 38, H: 80, D: 15, T: 2, HR: 7, RBI: 35, SB: 4, CS: 2, BB: 28, SO: 95, HBP: 4, SF: 3,
  OPSP: 72, WAR: -0.6,
};
const GENERIC_SP: PitLine = { G: 25, GS: 25, OUTS: 390, W: 6, L: 10, SV: 0, H: 150, ER: 82, HR: 20, BB: 55, SO: 95, ERAP: 75, WAR: -0.5 };
const GENERIC_RP: PitLine = { G: 45, GS: 0, OUTS: 150, W: 2, L: 3, SV: 0, H: 58, ER: 30, HR: 7, BB: 25, SO: 40, ERAP: 75, WAR: -0.3 };

function buildCareer(p: Player, data: StaticData): Career {
  const seasons = new Map<number, TrueSeason>();
  if (p.tid < 0) {
    return { seasons, debutAge: null, lastAge: p.quitAge ?? p.born + 99 };
  }
  const t = data.players[p.tid];
  const j = makeJitter(p.seed);
  const s = seeded(p.seed, 2);
  const useHit = t.r !== 'P';
  const usePit = t.r !== 'H';

  // career rates for regression
  let cWar = 0, cPA = 0, cPWar = 0, cOuts = 0;
  if (useHit) for (const r of t.hs) { cWar += r[H_WAR]; cPA += r[H_PA]; }
  if (usePit) for (const r of t.ps) { cPWar += r[P_WAR]; cOuts += r[P_OUTS]; }
  const careerHRate = ((cWar * j.war + 1.0 * (300 / 600)) / (cPA + 300)) * 600;
  const careerPRate = ((cPWar * j.war + 0.05 * (135 / 27)) / (cOuts + 135)) * 27;

  const hitRows = useHit ? t.hs : [];
  const pitRows = usePit ? t.ps : [];
  const ages = new Set<number>();
  hitRows.forEach((r) => ages.add(r[H_AGE]));
  pitRows.forEach((r) => ages.add(r[P_AGE]));
  const sorted = [...ages].sort((a, b) => a - b);
  if (!sorted.length) return { seasons, debutAge: null, lastAge: p.quitAge ?? 30 };

  const hitByAge = new Map<number, number[]>();
  hitRows.forEach((r) => {
    const prev = hitByAge.get(r[H_AGE]);
    if (!prev || prev[H_PA] < r[H_PA]) hitByAge.set(r[H_AGE], r);
  });
  const pitByAge = new Map<number, number[]>();
  pitRows.forEach((r) => {
    const prev = pitByAge.get(r[P_AGE]);
    if (!prev || prev[P_OUTS] < r[P_OUTS]) pitByAge.set(r[P_AGE], r);
  });

  const nearMax = (m: Map<number, number[]>, idx: number, age: number) => {
    let best = 0;
    for (let a = age - 2; a <= age + 2; a++) {
      const r = m.get(a);
      if (r) best = Math.max(best, r[idx]);
    }
    return best;
  };

  for (const age of sorted) {
    const hr = hitByAge.get(age);
    const pr = pitByAge.get(age);
    const ts: TrueSeason = {
      age, hRate: 0, pRate: 0, hCap: 0, pCap: 0, avail: 1, isStarter: false, pos: 8, posMask: 1 << 8, real: true,
    };
    let availH = 1, availP = 1;
    if (hr) {
      ts.hit = hitLineFromRow(hr, j, s);
      const war = hr[H_WAR] * j.war;
      ts.hRate = ((war + (careerHRate / 600) * HIT_REG_PA) / (hr[H_PA] + HIT_REG_PA)) * 600;
      const nm = nearMax(hitByAge, H_PA, age) * j.pt;
      ts.hCap = Math.min(MAX_PA, Math.max(ts.hit.PA, nm * 1.1 + 40));
      if (nm >= 300 && ts.hit.PA < 0.7 * nm) availH = clamp(ts.hit.PA / nm, 0.2, 1);
      ts.pos = hr[H_POS];
      ts.posMask = hr[H_MASK];
    }
    if (pr) {
      ts.pit = pitLineFromRow(pr, j, s);
      const war = pr[P_WAR] * j.war;
      ts.pRate = ((war + (careerPRate / 27) * PIT_REG_OUTS) / (pr[P_OUTS] + PIT_REG_OUTS)) * 27;
      ts.isStarter = pr[P_GS] >= 0.5 * pr[P_G] && pr[P_GS] >= 5;
      const nm = nearMax(pitByAge, P_OUTS, age) * j.pt;
      const cap = ts.isStarter ? MAX_SP_OUTS : MAX_RP_OUTS;
      ts.pCap = Math.min(cap, Math.max(ts.pit.OUTS, nm * 1.1 + 15));
      if (nm >= (ts.isStarter ? 300 : 120) && ts.pit.OUTS < 0.65 * nm) availP = clamp(ts.pit.OUTS / nm, 0.2, 1);
    }
    ts.avail = t.r === 'P' ? availP : t.r === 'H' ? availH : Math.min(availH, availP);
    seasons.set(age, ts);
  }

  // fill gap years inside the career (injury / minor-league seasons)
  const first = sorted[0];
  let last = sorted[sorted.length - 1];
  for (let a = first + 1; a < last; a++) {
    if (seasons.has(a)) continue;
    let lo = a - 1;
    while (!seasons.has(lo)) lo--;
    let hi = a + 1;
    while (!seasons.has(hi)) hi++;
    const base = seasons.get(lo)!;
    const next = seasons.get(hi)!;
    seasons.set(a, {
      ...base,
      age: a,
      hRate: (base.hRate + next.hRate) / 2 - 0.5,
      pRate: (base.pRate + next.pRate) / 2 - 0.03,
      avail: 0.35,
      real: false,
      hit: base.hit ? scaleHit(base.hit, 0.35, 0.95) : undefined,
      pit: base.pit ? scalePit(base.pit, 0.35, 0.95) : undefined,
    });
  }

  // project the rest of the career for players still active in the most recent season
  if (t.act) last = extendCareer(seasons, sorted, last, t.r, p.seed);

  return { seasons, debutAge: first, lastAge: last };
}

function agingDelta(age: number): number {
  if (age <= 24) return 0.6;
  if (age <= 26) return 0.3;
  if (age <= 29) return 0;
  if (age <= 31) return -0.35;
  if (age <= 33) return -0.55;
  if (age <= 35) return -0.75;
  return -0.95;
}

function extendCareer(seasons: Map<number, TrueSeason>, realAges: number[], last: number, role: string, seed: number): number {
  const rng = seeded(seed, 3);
  const recent = realAges.slice(-3).map((a) => seasons.get(a)!);
  const w = [3, 4, 5].slice(-recent.length);
  const wsum = w.reduce((a, b) => a + b, 0);
  let hRate = recent.reduce((acc, s, i) => acc + s.hRate * w[i], 0) / wsum;
  let pRate = recent.reduce((acc, s, i) => acc + s.pRate * w[i], 0) / wsum;
  let hCap = Math.max(...recent.map((s) => s.hCap));
  let pCap = Math.max(...recent.map((s) => s.pCap));
  const template = seasons.get(last)!;
  // Base lines: most playing time among the recent seasons
  const baseHit = recent.filter((s) => s.hit).sort((a, b) => b.hit!.PA - a.hit!.PA)[0]?.hit;
  const basePit = recent.filter((s) => s.pit).sort((a, b) => b.pit!.OUTS - a.pit!.OUTS)[0]?.pit;
  let quality = 1;
  let age = last;
  for (let n = 0; n < 16; n++) {
    age++;
    const d = agingDelta(age) + rng.normal(0, 0.6);
    hRate += d;
    pRate += d * 0.05;
    quality *= 1 + d * 0.03;
    if (age >= 33) {
      hCap *= 0.93;
      pCap *= 0.93;
    }
    const value = role === 'P' ? pRate * 20 : hRate;
    // retirement checks
    if (age >= 42) break;
    if (age >= 29 && value < 0 && rng.chance(0.55)) break;
    if (age >= 34 && value < 1 && rng.chance(0.45)) break;
    if (age >= 37 && rng.chance(0.25)) break;
    if ((role !== 'P' && hCap < 120) || (role === 'P' && pCap < 60)) break;
    const hf = baseHit ? Math.min(hCap, MAX_PA) / Math.max(1, baseHit.PA) : 0;
    const pf = basePit ? pCap / Math.max(1, basePit.OUTS) : 0;
    const hit = baseHit ? scaleHit(baseHit, hf, quality) : undefined;
    const pit = basePit ? scalePit(basePit, pf, quality) : undefined;
    if (hit) hit.WAR = +((hRate * hit.PA) / 600).toFixed(1);
    if (pit) pit.WAR = +((pRate * pit.OUTS) / 27).toFixed(1);
    seasons.set(age, {
      ...template,
      age,
      hRate,
      pRate,
      hCap: Math.min(hCap, MAX_PA),
      pCap,
      hit,
      pit,
      avail: rng.chance(0.15) ? rng.range(0.4, 0.9) : 1,
      real: false,
      projected: true,
    });
    last = age;
  }
  return last;
}

/**
 * The player's true season at an age, including pre-debut ages (a raw prospect
 * rushed to the majors) and never-MLB players. Returns null when the player is
 * past the end of his career.
 */
export function seasonAt(p: Player, age: number, data: StaticData): TrueSeason | null {
  const c = getCareer(p, data);
  const s = c.seasons.get(age);
  if (s) return s;
  if (c.debutAge === null) {
    // never reached the majors in real life: below replacement level
    const rng = seeded(p.seed, 10 + age);
    const pitcher = p.role === 'P';
    const sp = pitcher && rng.chance(0.5);
    return {
      age,
      hRate: pitcher ? 0 : -1.2 + rng.normal(0, 0.4) + Math.min(0, (age - 26) * 0.1),
      pRate: pitcher ? -0.08 + rng.normal(0, 0.03) : 0,
      hCap: pitcher ? 0 : 450,
      pCap: pitcher ? (sp ? 420 : 180) : 0,
      avail: 1,
      isStarter: sp,
      pos: posIndex(p.pos),
      posMask: 1 << posIndex(p.pos),
      real: false,
      hit: pitcher ? undefined : { ...GENERIC_HIT },
      pit: pitcher ? { ...(sp ? GENERIC_SP : GENERIC_RP) } : undefined,
    };
  }
  if (age < c.debutAge) {
    const base = c.seasons.get(c.debutAge)!;
    const yrs = c.debutAge - age;
    const q = Math.max(0.6, 1 - 0.07 * yrs);
    return {
      ...base,
      age,
      hRate: Math.min(base.hRate, 1.5) - 0.9 * yrs,
      pRate: Math.min(base.pRate, 0.1) - 0.05 * yrs,
      hCap: Math.max(base.hCap, 400),
      pCap: Math.max(base.pCap, base.isStarter ? 400 : 150),
      avail: 1,
      real: false,
      hit: base.hit ? scaleHit(base.hit, Math.max(1, 400 / Math.max(1, base.hit.PA)), q) : undefined,
      pit: base.pit ? scalePit(base.pit, Math.max(1, (base.isStarter ? 400 : 150) / Math.max(1, base.pit.OUTS)), q) : undefined,
    };
  }
  return null;
}

export function posIndex(pos: string): number {
  const i = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].indexOf(pos);
  return i < 0 ? 8 : i;
}
