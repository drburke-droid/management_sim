// ---------------------------------------------------------------------------
// Static data (public/data/*.json, produced by pipeline/build_data.py)
// ---------------------------------------------------------------------------

/** One real player's career, stripped of identity. Season rows are arrays; see H_* / P_* indexes. */
export interface Template {
  r: 'H' | 'P' | 'TW';
  b: string;
  t: string;
  ht: number;
  wt: number;
  intl: 0 | 1;
  act: 0 | 1;
  dr: [number, number] | null; // [draftYear, index into drafts[draftYear]]
  hs: number[][];
  ps: number[][];
}

/** [overall, round, level, pos, age, bats, throws, height, weight, templateIndex|-1] */
export type DraftRow = [number, number, 'HS' | 'JC' | '4Y', string, number, string, string, number, number, number];

export interface StaticData {
  players: Template[];
  drafts: Record<string, DraftRow[]>;
  firstYear: number;
  lastYear: number;
}

// hitting season indexes
export const H_AGE = 0, H_YEAR = 1, H_G = 2, H_PA = 3, H_AB = 4, H_R = 5, H_H = 6, H_2B = 7, H_3B = 8, H_HR = 9,
  H_RBI = 10, H_SB = 11, H_CS = 12, H_BB = 13, H_SO = 14, H_HBP = 15, H_SF = 16, H_OPSP = 17, H_WAR = 18,
  H_POS = 19, H_MASK = 20;
// pitching season indexes
export const P_AGE = 0, P_YEAR = 1, P_G = 2, P_GS = 3, P_OUTS = 4, P_W = 5, P_L = 6, P_SV = 7, P_H = 8, P_ER = 9,
  P_HR = 10, P_BB = 11, P_SO = 12, P_ERAP = 13, P_WAR = 14;

export const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;
export type Pos = (typeof POSITIONS)[number];

// ---------------------------------------------------------------------------
// Resolved (anonymized, jittered) seasons
// ---------------------------------------------------------------------------

export interface HitLine {
  G: number; PA: number; AB: number; R: number; H: number; D: number; T: number; HR: number; RBI: number;
  SB: number; CS: number; BB: number; SO: number; HBP: number; SF: number; OPSP: number; WAR: number;
}
export interface PitLine {
  G: number; GS: number; OUTS: number; W: number; L: number; SV: number; H: number; ER: number; HR: number;
  BB: number; SO: number; ERAP: number; WAR: number;
}

/** A player's "true" season at a given age (hidden from the user until it is played). */
export interface TrueSeason {
  age: number;
  hit?: HitLine;
  pit?: PitLine;
  /** hitting WAR per 600 PA, regressed for small samples */
  hRate: number;
  /** pitching WAR per 9 innings (27 outs), regressed */
  pRate: number;
  /** healthy playing-time ceiling (PA for hitters, outs for pitchers) */
  hCap: number;
  pCap: number;
  /** fraction of the season the player is healthy */
  avail: number;
  isStarter: boolean;
  pos: number; // primary position index
  posMask: number;
  /** season exists in real data (false = interpolated / pre-debut / projected) */
  real: boolean;
  projected?: boolean;
}

export interface Career {
  seasons: Map<number, TrueSeason>;
  debutAge: number | null;
  lastAge: number;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type Level = 'MLB' | 'MIN' | 'FA' | 'RET' | 'POOL'; // POOL = draft / international amateur pool

export interface Contract {
  salary: number;
  years: number; // seasons remaining including the current one
  kind: 'pre' | 'arb' | 'fa' | 'minor';
}

export interface GameSeason {
  year: number;
  age: number;
  team: string;
  hit?: HitLine;
  pit?: PitLine;
}

export interface Player {
  id: number;
  tid: number; // template index or -1 for a never-reached-MLB draftee
  seed: number;
  name: string;
  born: number;
  role: 'H' | 'P' | 'TW';
  bats: string;
  throws: string;
  ht: number;
  wt: number;
  pos: string;
  team: number; // -1 = none
  level: Level;
  contract: Contract;
  service: number;
  entryAge: number; // template seasons below this age are "pre-game" history
  hist: GameSeason[];
  /** weeks spent on an active MLB roster this season */
  weeksMLB: number;
  injuredWeeks: number;
  injuryPlan?: [number, number]; // [startWeek, lengthWeeks] this season
  draft?: { year: number; round: number; pick: number; team: string; level: string; bonus: number };
  intl?: boolean;
  school?: 'HS' | 'JC' | '4Y';
  /** for never-MLB players: age at which they give up */
  quitAge?: number;
  /** scouting fog: latent noise used to build displayed grades */
  scoutNoise: number;
  /** hidden: draft-day perceived grade */
  draftGrade?: number;
  faAsk?: { salary: number; years: number };
  retiredYear?: number;
}

export interface Finance {
  ticketPrice: number;
  concessionMult: number;
  marketing: number; // $/yr
  scouting: number;
  development: number;
  medical: number;
  tv: { annual: number; yearsLeft: number };
  cash: number;
  debt: number;
  cbtYears: number; // consecutive years over the tax
  season: Ledger; // current season running totals
  history: { year: number; ledger: Ledger; wins: number; losses: number; attendance: number; value: number }[];
}

export interface Ledger {
  tickets: number;
  concessions: number;
  merch: number;
  sponsors: number;
  localTV: number;
  national: number;
  postseason: number;
  revShare: number; // net (+ receive / - pay)
  payroll: number;
  minors: number;
  scouting: number;
  development: number;
  medical: number;
  marketing: number;
  stadium: number;
  frontOffice: number;
  bonuses: number;
  luxuryTax: number;
  interest: number;
  deadMoney: number;
  attendance: number;
  homeGames: number;
}

export interface Team {
  id: number;
  abbr: string;
  city: string;
  name: string;
  league: 'AL' | 'NL';
  division: 'East' | 'Central' | 'West';
  market: number;
  capacity: number;
  interest: number;
  w: number;
  l: number;
  lastW: number;
  lastL: number;
  fin: Finance;
  deadMoney: { amount: number; years: number }[];
}

export type Phase =
  | 'PRESEASON'
  | 'REGULAR'
  | 'POSTSEASON'
  | 'DRAFT'
  | 'INTL'
  | 'FREE_AGENCY'
  | 'DONE';

export interface Series {
  round: string;
  a: number;
  b: number;
  winsA: number;
  winsB: number;
  need: number;
  done: boolean;
}

export interface DraftState {
  sourceYear: number;
  order: number[]; // team ids in pick order for one round
  rounds: number;
  pick: number; // overall index into picks
  pool: number[]; // player ids still available
  log: { pick: number; team: number; player: number }[];
  undrafted?: number[];
}

export interface TradeRecord {
  year: number;
  week: number;
  a: number;
  b: number;
  aGave: string[];
  bGave: string[];
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  year: number;
  week: number; // 0..WEEKS
  phase: Phase;
  userTeam: number;
  teams: Team[];
  players: Record<number, Player>;
  nextId: number;
  usedTemplates: number[];
  usedDraftYears: number[];
  schedule: [number, number][][]; // per week: list of [home, away] games
  postseason: Series[];
  champion?: number;
  draft?: DraftState;
  intlPool?: number[];
  intlSpent?: Record<number, number>;
  faRound?: number;
  faOffers: Record<number, { salary: number; years: number }>;
  log: { year: number; week: number; text: string; kind?: 'good' | 'bad' | 'info' }[];
  trades: TradeRecord[];
  awards: { year: number; mvpAL?: number; mvpNL?: number; cyAL?: number; cyNL?: number; champ?: number }[];
  settings: { autoRoster: boolean };
  dollarsPerWar: number;
  namesUsed: string[];
}
