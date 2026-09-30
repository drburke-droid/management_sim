import { useState } from 'react';
import type { Player } from '../engine/types';
import { age } from '../engine/value';
import { PlayerLink, seasonTotals, teamAbbr } from './common';
import { r0, r1 } from './format';
import { useGame } from './GameContext';

export function LeagueView() {
  const { gs } = useGame();
  const [q, setQ] = useState('');
  const players = Object.values(gs.players).filter((p) => p.level !== 'POOL');
  const year = gs.year;
  const gp = Math.max(1, ...gs.teams.map((t) => t.w + t.l));
  const rows = players.map((p) => ({ p, s: seasonTotals(p, year) }));

  const leaders = (label: string, fn: (r: (typeof rows)[number]) => number | null, fmt: (x: number) => string, asc = false) => {
    const list = rows
      .map((r) => ({ p: r.p, v: fn(r) }))
      .filter((x): x is { p: Player; v: number } => x.v !== null)
      .sort((a, b) => (asc ? a.v - b.v : b.v - a.v))
      .slice(0, 10);
    return (
      <div className="card" key={label}>
        <h3>{label}</h3>
        <table>
          <tbody>
            {list.map(({ p, v }) => (
              <tr key={p.id} className={p.team === gs.userTeam ? 'me' : ''}>
                <td className="l"><PlayerLink p={p} /></td><td className="muted">{teamAbbr(gs, p)}</td><td><b>{fmt(v)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const found = q.length >= 2 ? players.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40) : [];

  return (
    <div className="grid">
      <div className="card row">
        <input placeholder="Search players…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        {found.length > 0 && (
          <div className="row">
            {found.map((p) => (
              <span key={p.id}><PlayerLink p={p} /> <span className="muted">({teamAbbr(gs, p)}, {age(p, year)})</span></span>
            ))}
          </div>
        )}
      </div>
      <h3 className="muted" style={{ margin: 0 }}>{year} leaders</h3>
      <div className="grid g3">
        {leaders('WAR (position players)', (r) => r.s.hit?.WAR ?? null, r1)}
        {leaders('WAR (pitchers)', (r) => r.s.pit?.WAR ?? null, r1)}
        {leaders('Home runs', (r) => r.s.hit?.HR ?? null, r0)}
        {leaders('Batting average', (r) => (r.s.hit && r.s.hit.PA >= 3.1 * gp ? r.s.hit.H / Math.max(1, r.s.hit.AB) : null), (x) => x.toFixed(3).replace(/^0/, ''))}
        {leaders('ERA', (r) => (r.s.pit && r.s.pit.OUTS >= 3 * gp ? (r.s.pit.ER * 27) / r.s.pit.OUTS : null), (x) => x.toFixed(2), true)}
        {leaders('Strikeouts', (r) => r.s.pit?.SO ?? null, r0)}
      </div>
      {gs.awards.length > 0 && (
        <div className="card">
          <h3>Awards &amp; champions</h3>
          <table>
            <thead><tr><th className="l">Year</th><th className="l">Champion</th><th className="l">AL MVP</th><th className="l">NL MVP</th><th className="l">AL Cy Young</th><th className="l">NL Cy Young</th></tr></thead>
            <tbody>
              {[...gs.awards].reverse().map((a) => {
                const cell = (id?: number) => {
                  const p = id !== undefined ? gs.players[id] : undefined;
                  return <td className="l">{p ? <PlayerLink p={p} /> : '—'}</td>;
                };
                return (
                  <tr key={a.year}>
                    <td className="l">{a.year}</td><td className="l">{a.champ !== undefined ? gs.teams[a.champ].name : '—'}</td>
                    {cell(a.mvpAL)}{cell(a.mvpNL)}{cell(a.cyAL)}{cell(a.cyNL)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {gs.trades.length > 0 && (
        <div className="card">
          <h3>Your trades</h3>
          {[...gs.trades].reverse().map((t, i) => (
            <div key={i} style={{ padding: '4px 0' }}>
              <span className="muted">{t.year} wk {t.week} with {gs.teams[t.b].abbr}:</span> sent {t.aGave.join(', ') || 'nothing'}; got {t.bGave.join(', ') || 'nothing'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
