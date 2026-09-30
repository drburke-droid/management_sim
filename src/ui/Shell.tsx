import { useState } from 'react';
import { exportGame } from '../engine/storage';
import { activeCount } from '../engine/roster';
import { TRADE_DEADLINE_WEEK, simPostseasonRound, simWeek } from '../engine/season';
import { advanceFreeAgency, autoDraft, beginOffseason, finishIntl, startNewSeason } from '../engine/offseason';
import type { GameState, StaticData } from '../engine/types';
import { ACTIVE_MAX, WEEKS, fmtMoney } from '../engine/value';
import { Dashboard } from './Dashboard';
import { DraftView } from './Draft';
import { FinanceView } from './Finances';
import { FreeAgentsView } from './FreeAgents';
import { useGame } from './GameContext';
import { LeagueView } from './League';
import { PlayerModal } from './PlayerModal';
import { RosterView } from './Roster';
import { StandingsView } from './Standings';
import { TradeView } from './Trade';
import { pct } from './format';

const TABS: [string, string][] = [
  ['dashboard', 'Owner’s Box'],
  ['roster', 'Roster'],
  ['standings', 'Standings'],
  ['finances', 'Finances'],
  ['trade', 'Trades'],
  ['fa', 'Free Agents'],
  ['draft', 'Draft & Intl'],
  ['league', 'League'],
];

export function phaseLabel(gs: GameState) {
  switch (gs.phase) {
    case 'PRESEASON': return 'Spring Training';
    case 'REGULAR': return `Week ${gs.week} of ${WEEKS}`;
    case 'POSTSEASON': return 'Postseason';
    case 'DONE': return 'Season complete';
    case 'DRAFT': return 'Amateur Draft';
    case 'INTL': return 'International Signing';
    case 'FREE_AGENCY': return `Free Agency (round ${(gs.faRound ?? 0) + 1})`;
  }
}

function rosterProblem(gs: GameState): string | null {
  if (gs.settings.autoRoster) return null;
  const n = activeCount(gs, gs.userTeam);
  if (n > ACTIVE_MAX) return `Your active roster has ${n} players. Send ${n - ACTIVE_MAX} down (max ${ACTIVE_MAX}) before simming.`;
  return null;
}

function simUntil(gs: GameState, data: StaticData, stop: (gs: GameState) => boolean) {
  let guard = 0;
  while (!stop(gs) && gs.phase !== 'POSTSEASON' && guard++ < 40) simWeek(gs, data);
}

export function Shell() {
  const { gs, data, act, tab, setTab, playerId, quit } = useGame();
  const [err, setErr] = useState<string | null>(null);
  const t = gs.teams[gs.userTeam];

  const run = (fn: (gs: GameState) => void) => {
    const problem = rosterProblem(gs);
    if (problem && (gs.phase === 'REGULAR' || gs.phase === 'PRESEASON')) {
      setErr(problem);
      setTab('roster');
      return;
    }
    setErr(null);
    act(fn);
  };

  const controls = () => {
    switch (gs.phase) {
      case 'PRESEASON':
      case 'REGULAR':
        return (
          <>
            <button className="primary" onClick={() => run((g) => simWeek(g, data))}>Sim week</button>
            {gs.week < TRADE_DEADLINE_WEEK && (
              <button onClick={() => run((g) => simUntil(g, data, (x) => x.week >= TRADE_DEADLINE_WEEK))}>To deadline</button>
            )}
            <button onClick={() => run((g) => simUntil(g, data, () => false))}>To season end</button>
          </>
        );
      case 'POSTSEASON':
        return (
          <>
            <button className="primary" onClick={() => run((g) => void simPostseasonRound(g, data))}>Play next round</button>
            <button onClick={() => run((g) => { while (!simPostseasonRound(g, data)); })}>Sim to champion</button>
          </>
        );
      case 'DONE':
        return (
          <button className="primary" onClick={() => { run((g) => { beginOffseason(g, data); autoDraft(g, data); }); setTab('draft'); }}>
            Begin offseason
          </button>
        );
      case 'DRAFT':
        return <button onClick={() => { setTab('draft'); run((g) => autoDraft(g, data, true)); }}>Auto-draft rest</button>;
      case 'INTL':
        return <button className="primary" onClick={() => { run((g) => finishIntl(g, data)); setTab('fa'); }}>Finish intl signing</button>;
      case 'FREE_AGENCY':
        return (
          <>
            <button onClick={() => run((g) => advanceFreeAgency(g, data))}>Resolve FA round</button>
            <button className="primary" onClick={() => { run((g) => startNewSeason(g, data)); setTab('dashboard'); }}>
              Start {gs.year + 1} season
            </button>
          </>
        );
    }
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">FRONT <span>OFFICE</span></div>
        <div className="teamchip">{t.city} {t.name}</div>
        <div className="stat"><small>{gs.year}</small>{phaseLabel(gs)}</div>
        <div className="stat"><small>Record</small>{t.w}-{t.l} ({pct(t.w, t.l)})</div>
        <div className="stat"><small>Cash</small><span className={t.fin.cash > 0 ? '' : 'bad'}>{fmtMoney(t.fin.cash)}</span></div>
        {t.fin.debt > 0 && <div className="stat"><small>Debt</small><span className="bad">{fmtMoney(t.fin.debt)}</span></div>}
        <div className="spacer" />
        <div className="row">{controls()}</div>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value === 'export') exportGame(gs);
            if (e.target.value === 'quit') quit();
            e.target.value = '';
          }}
        >
          <option value="">⋯</option>
          <option value="export">Export save</option>
          <option value="quit">New game</option>
        </select>
      </div>
      <div className="nav">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <main>
        {err && <div className="notice err">{err}</div>}
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'roster' && <RosterView />}
        {tab === 'standings' && <StandingsView />}
        {tab === 'finances' && <FinanceView />}
        {tab === 'trade' && <TradeView />}
        {tab === 'fa' && <FreeAgentsView />}
        {tab === 'draft' && <DraftView />}
        {tab === 'league' && <LeagueView />}
      </main>
      {playerId !== null && gs.players[playerId] && <PlayerModal />}
    </div>
  );
}
