import { useState } from 'react';
import { SLOT_NAMES, computeUsage } from '../engine/depth';
import { activeCount, callUp, minorsCount, release, sendDown, teamPlayers } from '../engine/roster';
import type { Player } from '../engine/types';
import { ACTIVE_MAX, MINORS_MAX, age } from '../engine/value';
import { Contract, Eta, Grade, PlayerLink, Proj, projFor, seasonTotals, useSorted } from './common';
import { avg, era, ip, obp, r0, r1, slg } from './format';
import { useGame } from './GameContext';

export function RosterView() {
  const { gs, data, act } = useGame();
  const [msg, setMsg] = useState<string | null>(null);
  const players = teamPlayers(gs, gs.userTeam);
  const active = players.filter((p) => p.level === 'MLB' && p.injuredWeeks === 0);
  const il = players.filter((p) => p.level === 'MLB' && p.injuredWeeks > 0);
  const minors = players.filter((p) => p.level === 'MIN');
  const hitters = active.filter((p) => p.role !== 'P');
  const pitchers = active.filter((p) => p.role !== 'H');
  const usage = computeUsage(gs, data, gs.userTeam);
  const slotOf = new Map(usage.hitters.map((u) => [u.pid, u.slot]));
  const paOf = new Map(usage.hitters.map((u) => [u.pid, u.pa]));
  const roleOf = new Map(usage.pitchers.map((u) => [u.pid, u.role]));

  const doAct = (fn: () => string | null | void) =>
    act(() => {
      const r = fn();
      setMsg(r || null);
    });

  const actions = (p: Player) => (
    <td className="l">
      {p.level === 'MLB' && <button className="small" onClick={() => doAct(() => sendDown(gs, p))}>Option</button>}
      {p.level === 'MIN' && <button className="small" onClick={() => doAct(() => callUp(gs, p))}>Call up</button>}{' '}
      <button
        className="small danger"
        onClick={() => {
          const owed = p.contract.kind === 'fa' || p.contract.kind === 'arb' ? p.contract.salary * p.contract.years : 0;
          if (confirm(`Release ${p.name}?${owed ? ` You still owe $${(owed / 1e6).toFixed(1)}M.` : ''}`)) doAct(() => release(gs, p));
        }}
      >
        Release
      </button>
    </td>
  );

  const hitSort = useSorted(hitters, {
    name: (p) => p.name, pos: (p) => slotOf.get(p.id) ?? 99, age: (p) => age(p, gs.year), proj: (p) => projFor(p, gs, data),
    pa: (p) => seasonTotals(p, gs.year).hit?.PA ?? 0, war: (p) => seasonTotals(p, gs.year).hit?.WAR ?? 0,
    sal: (p) => p.contract.salary,
  }, 'pos', 1);
  const pitSort = useSorted(pitchers, {
    name: (p) => p.name, role: (p) => (roleOf.get(p.id) === 'SP' ? 0 : 1), age: (p) => age(p, gs.year), proj: (p) => projFor(p, gs, data),
    ip: (p) => seasonTotals(p, gs.year).pit?.OUTS ?? 0, war: (p) => seasonTotals(p, gs.year).pit?.WAR ?? 0,
    sal: (p) => p.contract.salary,
  }, 'role', 1);
  const minSort = useSorted(minors, {
    name: (p) => p.name, pos: (p) => p.pos, age: (p) => age(p, gs.year), proj: (p) => projFor(p, gs, data),
    sal: (p) => p.contract.salary,
  }, 'proj');

  return (
    <div className="grid">
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <span>Active: <b className={activeCount(gs, gs.userTeam) > ACTIVE_MAX ? 'bad' : ''}>{activeCount(gs, gs.userTeam)}</b>/{ACTIVE_MAX}</span>
          <span>Injured list: <b>{il.length}</b></span>
          <span>Minors: <b>{minorsCount(gs, gs.userTeam)}</b>/{MINORS_MAX}</span>
        </div>
        <label className="row" title="When on, your manager fills injuries, calls up hot prospects and keeps the roster legal.">
          <input type="checkbox" checked={gs.settings.autoRoster} onChange={(e) => act((g) => (g.settings.autoRoster = e.target.checked))} />
          Let the manager handle call-ups &amp; injuries
        </label>
      </div>
      {msg && <div className="notice err">{msg}</div>}

      <div className="card">
        <h3>Position players</h3>
        <table>
          <thead>
            <tr>
              {hitSort.th('name', 'Name', 'l')}{hitSort.th('pos', 'Pos')}{hitSort.th('age', 'Age')}<th>B/T</th>
              {hitSort.th('proj', 'Proj WAR')}{hitSort.th('pa', 'PA')}<th>AVG/OBP/SLG</th><th>HR</th><th>SB</th><th>OPS+</th>
              {hitSort.th('war', 'WAR')}{hitSort.th('sal', 'Contract')}<th />
            </tr>
          </thead>
          <tbody>
            {hitSort.sorted.map((p) => {
              const h = seasonTotals(p, gs.year).hit;
              const slot = slotOf.get(p.id);
              return (
                <tr key={p.id}>
                  <td className="l"><PlayerLink p={p} /></td>
                  <td>{slot !== null && slot !== undefined ? <b>{SLOT_NAMES[slot]}</b> : <span className="muted">{p.pos} (bench)</span>}</td>
                  <td>{age(p, gs.year)}</td>
                  <td>{p.bats}/{p.throws}</td>
                  <td><Proj p={p} /></td>
                  <td>{h ? r0(h.PA) : 0}</td>
                  <td>{h ? `${avg(h)}/${obp(h)}/${slg(h)}` : '—'}</td>
                  <td>{h ? r0(h.HR) : ''}</td>
                  <td>{h ? r0(h.SB) : ''}</td>
                  <td>{h ? r0(h.OPSP) : ''}</td>
                  <td>{h ? r1(h.WAR) : ''}</td>
                  <td><Contract p={p} /></td>
                  {actions(p)}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          Projected playing time: {hitters.map((p) => `${p.name.split(' ').slice(-1)[0]} ${Math.round(paOf.get(p.id) ?? 0)}`).join(' · ')} PA
          {usage.replacementPA > 50 && <span className="warn"> · {Math.round(usage.replacementPA)} PA to replacement-level call-ups</span>}
        </div>
      </div>

      <div className="card">
        <h3>Pitchers</h3>
        <table>
          <thead>
            <tr>
              {pitSort.th('name', 'Name', 'l')}{pitSort.th('role', 'Role')}{pitSort.th('age', 'Age')}<th>T</th>
              {pitSort.th('proj', 'Proj WAR')}<th>G</th><th>GS</th>{pitSort.th('ip', 'IP')}<th>W-L</th><th>SV</th><th>ERA</th><th>SO</th>
              <th>ERA+</th>{pitSort.th('war', 'WAR')}{pitSort.th('sal', 'Contract')}<th />
            </tr>
          </thead>
          <tbody>
            {pitSort.sorted.map((p) => {
              const s = seasonTotals(p, gs.year).pit;
              return (
                <tr key={p.id}>
                  <td className="l"><PlayerLink p={p} /></td>
                  <td>{roleOf.get(p.id) ?? '—'}</td>
                  <td>{age(p, gs.year)}</td>
                  <td>{p.throws}</td>
                  <td><Proj p={p} /></td>
                  <td>{s ? r0(s.G) : 0}</td>
                  <td>{s ? r0(s.GS) : 0}</td>
                  <td>{s ? ip(s) : '0.0'}</td>
                  <td>{s ? `${r0(s.W)}-${r0(s.L)}` : ''}</td>
                  <td>{s ? r0(s.SV) : ''}</td>
                  <td>{s ? era(s) : ''}</td>
                  <td>{s ? r0(s.SO) : ''}</td>
                  <td>{s ? r0(s.ERAP) : ''}</td>
                  <td>{s ? r1(s.WAR) : ''}</td>
                  <td><Contract p={p} /></td>
                  {actions(p)}
                </tr>
              );
            })}
          </tbody>
        </table>
        {usage.replacementOuts > 30 && (
          <div className="warn" style={{ marginTop: 6, fontSize: 12 }}>
            {Math.round(usage.replacementOuts / 3)} innings will go to replacement-level arms. You need more pitching depth.
          </div>
        )}
      </div>

      {il.length > 0 && (
        <div className="card">
          <h3>Injured list</h3>
          <table>
            <tbody>
              {il.map((p) => (
                <tr key={p.id}>
                  <td className="l"><PlayerLink p={p} /></td>
                  <td>{p.pos}</td>
                  <td>{age(p, gs.year)}</td>
                  <td>out {p.injuredWeeks} more wk</td>
                  <td><Contract p={p} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>Minor leagues</h3>
        <table>
          <thead>
            <tr>
              {minSort.th('name', 'Name', 'l')}{minSort.th('pos', 'Pos')}{minSort.th('age', 'Age')}<th>B/T</th><th>Ht/Wt</th>
              <th title="Future value on the 20-80 scouting scale, as your scouts see it">FV</th><th>ETA</th>
              {minSort.th('proj', 'Proj WAR')}<th>Acquired</th>{minSort.th('sal', 'Contract')}<th />
            </tr>
          </thead>
          <tbody>
            {minSort.sorted.map((p) => (
              <tr key={p.id}>
                <td className="l"><PlayerLink p={p} /></td>
                <td>{p.pos}</td>
                <td>{age(p, gs.year)}</td>
                <td>{p.bats}/{p.throws}</td>
                <td>{Math.floor(p.ht / 12)}'{p.ht % 12}" {p.wt}</td>
                <td><Grade p={p} /></td>
                <td><Eta p={p} /></td>
                <td><Proj p={p} /></td>
                <td className="muted">
                  {p.draft ? (p.draft.round ? `${p.draft.year} rd ${p.draft.round}` : p.draft.level === 'INTL' ? `${p.draft.year} intl` : `${p.draft.year} UDFA`) : 'org'}
                </td>
                <td><Contract p={p} /></td>
                {actions(p)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
