import { useState } from 'react';
import { teamPlayers } from '../engine/roster';
import { TRADE_DEADLINE_WEEK } from '../engine/season';
import { evaluateTrade, executeTrade, tradeWindowOpen, type TradeEval } from '../engine/trade';
import type { Player } from '../engine/types';
import { age } from '../engine/value';
import { Contract, Grade, PlayerLink, Proj, isProspect, projFor } from './common';
import { useGame } from './GameContext';

export function TradeView() {
  const { gs, data, act } = useGame();
  const others = gs.teams.filter((t) => t.id !== gs.userTeam);
  const [partner, setPartner] = useState(others[0].id);
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [result, setResult] = useState<TradeEval | null>(null);

  const toggle = (list: number[], set: (x: number[]) => void, id: number) => {
    setResult(null);
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const table = (players: Player[], sel: number[], set: (x: number[]) => void) => (
    <table>
      <thead><tr><th /><th className="l">Player</th><th>Pos</th><th>Age</th><th>Lvl</th><th>Proj</th><th>FV</th><th>Contract</th></tr></thead>
      <tbody>
        {players
          .sort((a, b) => (a.level === b.level ? projFor(b, gs, data) - projFor(a, gs, data) : a.level === 'MLB' ? -1 : 1))
          .map((p) => (
            <tr key={p.id} className={sel.includes(p.id) ? 'me' : ''}>
              <td><input type="checkbox" checked={sel.includes(p.id)} onChange={() => toggle(sel, set, p.id)} /></td>
              <td className="l"><PlayerLink p={p} /></td>
              <td>{p.pos}</td>
              <td>{age(p, gs.year)}</td>
              <td className="muted">{p.level === 'MLB' ? 'MLB' : 'MiLB'}</td>
              <td><Proj p={p} /></td>
              <td>{isProspect(p, data) ? <Grade p={p} /> : ''}</td>
              <td><Contract p={p} /></td>
            </tr>
          ))}
      </tbody>
    </table>
  );

  const open = tradeWindowOpen(gs);
  const mine = teamPlayers(gs, gs.userTeam);
  const theirs = teamPlayers(gs, partner);

  return (
    <div className="grid">
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          Trade partner:
          <select
            value={partner}
            onChange={(e) => {
              setPartner(+e.target.value);
              setGet([]);
              setResult(null);
            }}
          >
            {others.map((t) => (
              <option key={t.id} value={t.id}>{t.city} {t.name} ({t.w}-{t.l})</option>
            ))}
          </select>
        </div>
        <div className="row">
          <button disabled={!open} onClick={() => setResult(evaluateTrade(gs, data, partner, give, get))}>Propose</button>
          {result?.accept && (
            <button
              className="primary"
              onClick={() => {
                act((g) => executeTrade(g, data, partner, give, get));
                setGive([]);
                setGet([]);
                setResult(null);
              }}
            >
              Make the deal
            </button>
          )}
        </div>
      </div>
      {!open && (
        <div className="notice">
          {gs.phase === 'REGULAR' && gs.week >= TRADE_DEADLINE_WEEK ? 'The trade deadline has passed. Trading reopens after the World Series.' : 'Trades are frozen during the draft and international signing period.'}
        </div>
      )}
      {result && <div className={`notice ${result.accept ? '' : 'err'}`}>{result.reason}</div>}
      <div className="grid g2">
        <div className="card">
          <h3>You send</h3>
          {table(mine, give, setGive)}
        </div>
        <div className="card">
          <h3>You receive</h3>
          {table(theirs, get, setGet)}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        AI clubs value players on what their scouts can see: track record, age, contract and prospect grades. Contenders pay for
        this year; rebuilders pay for cheap control and youth. Nobody knows the future, including you.
      </p>
    </div>
  );
}
