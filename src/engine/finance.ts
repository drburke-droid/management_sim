import { clamp } from './rng';
import type { Finance, GameState, Ledger, Player, Team } from './types';
import { START_YEAR, WEEKS } from './value';

/*
 * Owner economics. All figures are annual dollars; recurring items accrue
 * weekly (1/WEEKS per week), gate items accrue per home game.
 */

export const REVENUE_SHARE_RATE = 0.48;
export const NATIONAL_REVENUE = 95_000_000;
export const FRONT_OFFICE = 50_000_000; // front office, travel, benefits, admin
export const MINORS_BASE = 20_000_000;
export const INTEREST_RATE = 0.065;

export function inflation(year: number) {
  return Math.pow(1.03, year - START_YEAR);
}

export function cbtThreshold(year: number) {
  return Math.round(244_000_000 * Math.pow(1.025, year - START_YEAR));
}

export function emptyLedger(): Ledger {
  return {
    tickets: 0, concessions: 0, merch: 0, sponsors: 0, localTV: 0, national: 0, postseason: 0, revShare: 0,
    payroll: 0, minors: 0, scouting: 0, development: 0, medical: 0, marketing: 0, stadium: 0, frontOffice: 0,
    bonuses: 0, luxuryTax: 0, interest: 0, deadMoney: 0, attendance: 0, homeGames: 0,
  };
}

export const REVENUE_KEYS = ['tickets', 'concessions', 'merch', 'sponsors', 'localTV', 'national', 'postseason', 'revShare'] as const;
export const EXPENSE_KEYS = [
  'payroll', 'deadMoney', 'luxuryTax', 'minors', 'bonuses', 'scouting', 'development', 'medical', 'marketing', 'stadium',
  'frontOffice', 'interest',
] as const;

export function revenue(l: Ledger) {
  return REVENUE_KEYS.reduce((a, k) => a + l[k], 0);
}
export function expenses(l: Ledger) {
  return EXPENSE_KEYS.reduce((a, k) => a + l[k], 0);
}

export function refTicketPrice(t: Team, year: number) {
  return Math.round((25 + 25 * t.market) * inflation(year));
}

export function defaultFinance(t: Pick<Team, 'market' | 'capacity'>): Finance {
  return {
    ticketPrice: Math.round(25 + 25 * t.market),
    concessionMult: 1,
    marketing: Math.round((6 + 6 * t.market) * 1e6),
    scouting: Math.round((6 + 4 * t.market) * 1e6),
    development: Math.round((8 + 5 * t.market) * 1e6),
    medical: Math.round((4 + 3 * t.market) * 1e6),
    tv: { annual: localTVValue(t.market, 50), yearsLeft: 2 + Math.floor(t.market * 5) % 8 },
    cash: Math.round((40 + 40 * t.market) * 1e6),
    debt: 0,
    cbtYears: 0,
    season: emptyLedger(),
    history: [],
  };
}

export function localTVValue(market: number, interest: number, year = START_YEAR) {
  return Math.round(40_000_000 * Math.pow(market, 1.25) * (0.6 + 0.8 * (interest / 100)) * inflation(year));
}

export function payrollOf(gs: GameState, teamId: number, includeMinors = false) {
  let total = 0;
  for (const p of Object.values(gs.players)) {
    if (p.team !== teamId) continue;
    if (p.level === 'MLB' || (includeMinors && p.level === 'MIN')) total += p.contract.salary;
  }
  return total;
}

export function deadMoneyOf(t: Team) {
  return t.deadMoney.reduce((a, d) => a + d.amount, 0);
}

/** Star power: fans come to see players with big, visible seasons. */
export function starPower(gs: GameState, teamId: number, visibleWar: (p: Player) => number) {
  let s = 0;
  for (const p of Object.values(gs.players)) {
    if (p.team !== teamId || p.level !== 'MLB') continue;
    s += Math.max(0, visibleWar(p) - 3);
  }
  return s;
}

/** Fraction of seats sold for one home game. */
export function gameDemand(t: Team, year: number, winPct: number, gamesPlayed: number, stars: number) {
  const priceFactor = Math.pow(refTicketPrice(t, year) / Math.max(5, t.fin.ticketPrice), 0.75);
  const interestFactor = 0.45 + 0.9 * (t.interest / 100);
  const base = 0.62 + 0.18 * t.market;
  const mkt = 1 + 0.06 * Math.log2(1 + t.fin.marketing / 5_000_000 / inflation(year));
  const form = gamesPlayed >= 10 ? 1 + (winPct - 0.5) * 1.4 : 1;
  const starF = 1 + Math.min(0.15, stars * 0.012);
  const conc = 1 - 0.15 * (t.fin.concessionMult - 1);
  return clamp(base * interestFactor * priceFactor * mkt * form * starF * conc, 0.12, 1);
}

export function perFanSpend(t: Team, year: number) {
  return 22 * t.fin.concessionMult * inflation(year);
}

/** Weekly accrual of annual items. */
export function accrueWeek(gs: GameState, t: Team, homeGames: number, winPct: number, gamesPlayed: number, stars: number) {
  const L = t.fin.season;
  const y = gs.year;
  const f = 1 / WEEKS;
  const infl = inflation(y);
  if (homeGames > 0) {
    const att = Math.round(t.capacity * gameDemand(t, y, winPct, gamesPlayed, stars));
    L.attendance += att * homeGames;
    L.homeGames += homeGames;
    L.tickets += att * homeGames * t.fin.ticketPrice;
    L.concessions += att * homeGames * perFanSpend(t, y);
  }
  const interest = 0.5 + t.interest / 100;
  L.merch += f * 12_000_000 * Math.pow(t.market, 0.8) * interest * (1 + Math.min(0.5, stars * 0.04)) * infl;
  L.sponsors += f * 28_000_000 * t.market * interest * infl;
  L.localTV += f * t.fin.tv.annual;
  L.national += f * NATIONAL_REVENUE * infl;
  L.payroll += f * payrollOf(gs, t.id);
  let minors = 0, minorCount = 0;
  for (const p of Object.values(gs.players))
    if (p.team === t.id && p.level === 'MIN') {
      minors += p.contract.salary;
      minorCount++;
    }
  L.minors += f * (minors + MINORS_BASE * infl + minorCount * 40_000);
  L.scouting += f * t.fin.scouting;
  L.development += f * t.fin.development;
  L.medical += f * t.fin.medical;
  L.marketing += f * t.fin.marketing;
  L.stadium += f * (25_000_000 + t.capacity * 500) * infl;
  L.frontOffice += f * FRONT_OFFICE * infl;
  L.deadMoney += f * deadMoneyOf(t);
  L.interest += f * t.fin.debt * INTEREST_RATE;
}

/** Settle cash from the difference between the ledger and what has been booked so far. */
export function settleCash(t: Team, before: number) {
  const net = revenue(t.fin.season) - expenses(t.fin.season);
  t.fin.cash += net - before;
  if (t.fin.cash < 0) {
    // the bank covers the shortfall
    t.fin.debt += -t.fin.cash;
    t.fin.cash = 0;
  }
}

export function netOf(t: Team) {
  return revenue(t.fin.season) - expenses(t.fin.season);
}

/** Rough full-season revenue estimate used before any games have been played. */
export function estimatedRevenue(t: Team, year: number) {
  const infl = inflation(year);
  const interest = 0.5 + t.interest / 100;
  const gate = 81 * t.capacity * Math.min(1, 0.62 + 0.18 * t.market) * (0.45 + 0.9 * t.interest / 100) * (t.fin.ticketPrice + 22 * infl);
  return gate + t.fin.tv.annual + NATIONAL_REVENUE * infl + (12_000_000 * Math.pow(t.market, 0.8) + 28_000_000 * t.market) * interest * infl;
}

/** Estimated franchise value: a revenue multiple that rises with market size and fan interest. */
export function franchiseValue(t: Team, lastRevenue: number) {
  const mult = 5 + 3 * t.market + (t.interest - 50) / 25;
  return Math.max(500_000_000, lastRevenue * mult);
}

/** Year-end: revenue sharing and competitive balance tax. */
export function yearEndSettlement(gs: GameState) {
  const locals = gs.teams.map((t) => {
    const L = t.fin.season;
    return Math.max(0, L.tickets + L.concessions + L.merch + L.sponsors + L.localTV + L.postseason - L.stadium);
  });
  const pool = locals.reduce((a, b) => a + b, 0) * REVENUE_SHARE_RATE;
  const threshold = cbtThreshold(gs.year);
  gs.teams.forEach((t, i) => {
    const before = netOf(t);
    t.fin.season.revShare = pool / gs.teams.length - locals[i] * REVENUE_SHARE_RATE;
    const payroll = t.fin.season.payroll + t.fin.season.deadMoney;
    if (payroll > threshold) {
      const base = [0.2, 0.3, 0.5][Math.min(2, t.fin.cbtYears)];
      const over = payroll - threshold;
      let tax = over * base;
      if (over > 20e6) tax += (over - 20e6) * 0.12;
      if (over > 40e6) tax += (over - 40e6) * 0.3;
      if (over > 60e6) tax += (over - 60e6) * 0.18;
      t.fin.season.luxuryTax = tax;
      t.fin.cbtYears++;
    } else {
      t.fin.cbtYears = 0;
    }
    settleCash(t, before);
  });
}

/** Fan interest moves toward a market baseline, pushed by winning, stars and pricing. */
export function updateInterest(t: Team, year: number, winPct: number, playoffRounds: number, champion: boolean, stars: number) {
  let v = t.interest * 0.7 + 50 * 0.3;
  v += (winPct - 0.5) * 90;
  v += playoffRounds * 4 + (champion ? 10 : 0);
  v += Math.min(8, stars * 0.6);
  v += 3 * Math.log2(1 + t.fin.marketing / 8_000_000 / inflation(year)) - 3;
  const ratio = t.fin.ticketPrice / refTicketPrice(t, year);
  if (ratio > 1.25) v -= (ratio - 1.25) * 25;
  if (t.fin.concessionMult > 1.2) v -= (t.fin.concessionMult - 1.2) * 15;
  t.interest = clamp(Math.round(v), 5, 100);
}
