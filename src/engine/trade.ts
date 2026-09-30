import { activeCount, log, manageRoster, minorsCount } from './roster';
import { TRADE_DEADLINE_WEEK } from './season';
import type { GameState, StaticData } from './types';
import { ACTIVE_MAX, MINORS_MAX, fmtMoney, scoutingLevel, surplusValue } from './value';

export interface TradeEval {
  accept: boolean;
  aiGain: number;
  receiveValue: number;
  giveValue: number;
  reason: string;
}

export function tradeWindowOpen(gs: GameState) {
  if (gs.phase === 'REGULAR' && gs.week >= TRADE_DEADLINE_WEEK) return false;
  return gs.phase !== 'DRAFT' && gs.phase !== 'INTL';
}

function contending(gs: GameState, teamId: number) {
  const t = gs.teams[teamId];
  const gp = t.w + t.l;
  const pct = gp >= 20 ? t.w / gp : t.lastW / Math.max(1, t.lastW + t.lastL);
  return Math.max(0, Math.min(1, (pct - 0.44) / 0.14));
}

/**
 * The AI club values players by surplus value (projected WAR x $/WAR minus
 * salary over the years of control) using only what its scouts can see.
 * Contenders care more about this year; rebuilders more about the future.
 */
export function evaluateTrade(gs: GameState, data: StaticData, aiTeam: number, userGives: number[], userGets: number[]): TradeEval {
  const t = gs.teams[aiTeam];
  const lvl = scoutingLevel(t);
  const c = contending(gs, aiTeam);
  const val = (pid: number) => surplusValue(gs.players[pid], gs, data, lvl, c);
  // quantity doesn't buy quality: extra bodies beyond a 1-for-1 swap count half
  const recv = userGives.map(val).sort((a, b) => b - a);
  const receiveValue = recv.reduce((a, v, i) => a + (i < Math.max(1, userGets.length) || v < 0 ? v : v * 0.5), 0);
  const giveValue = userGets.reduce((a, pid) => a + val(pid), 0);
  const aiGain = receiveValue - giveValue;
  const hurdle = Math.max(1_500_000, Math.abs(giveValue) * 0.08);
  if (!userGives.length && !userGets.length) return { accept: false, aiGain, receiveValue, giveValue, reason: 'Nothing on the table.' };
  if (!tradeWindowOpen(gs)) return { accept: false, aiGain, receiveValue, giveValue, reason: 'Trades are not allowed right now.' };
  // roster count sanity for the AI club
  const inN = userGives.length, outN = userGets.length;
  if (activeCount(gs, aiTeam) + minorsCount(gs, aiTeam) + inN - outN > ACTIVE_MAX + MINORS_MAX + 3)
    return { accept: false, aiGain, receiveValue, giveValue, reason: `${t.abbr} doesn't have room for that many players.` };
  if (aiGain >= hurdle) return { accept: true, aiGain, receiveValue, giveValue, reason: `${t.abbr} accepts.` };
  const short = hurdle - aiGain;
  const reason =
    short < 5_000_000 ? `${t.abbr} says it's close. Add a little more.` :
    short < 20_000_000 ? `${t.abbr} wants more value back (~${fmtMoney(short)} short).` :
    `${t.abbr} isn't interested (${fmtMoney(short)} short).`;
  return { accept: false, aiGain, receiveValue, giveValue, reason };
}

export function executeTrade(gs: GameState, data: StaticData, aiTeam: number, userGives: number[], userGets: number[]) {
  const user = gs.userTeam;
  for (const pid of userGives) gs.players[pid].team = aiTeam;
  for (const pid of userGets) {
    const p = gs.players[pid];
    p.team = user;
    // arriving big leaguers go to the minors if there's no active spot
    if (p.level === 'MLB' && activeCount(gs, user) > ACTIVE_MAX) p.level = 'MIN';
  }
  manageRoster(gs, data, aiTeam, { allowFA: true });
  if (gs.settings.autoRoster) manageRoster(gs, data, user, { allowFA: true });
  const names = (ids: number[]) => ids.map((id) => gs.players[id].name);
  gs.trades.push({ year: gs.year, week: gs.week, a: user, b: aiTeam, aGave: names(userGives), bGave: names(userGets) });
  log(gs, `Trade with ${gs.teams[aiTeam].abbr}: sent ${names(userGives).join(', ') || 'nothing'}; received ${names(userGets).join(', ') || 'nothing'}.`, 'good');
}
