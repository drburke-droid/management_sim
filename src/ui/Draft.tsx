import { useState } from 'react';
import { INTL_POOL, autoDraft, draftPlayer, intlBonus, signIntl, slotBonus, teamOnClock } from '../engine/offseason';
import { inflation } from '../engine/finance';
import type { Player } from '../engine/types';
import { age, fmtMoney, perceivedFV, scoutingLevel } from '../engine/value';
import { Grade, PlayerLink, useSorted } from './common';
import { height } from './format';
import { useGame } from './GameContext';

const LEVEL: Record<string, string> = { HS: 'High school', JC: 'Junior college', '4Y': 'College' };

export function DraftView() {
  const { gs } = useGame();
  if (gs.phase === 'DRAFT' && gs.draft) return <DraftBoard />;
  if (gs.phase === 'INTL') return <IntlBoard />;
  const mine = Object.values(gs.players).filter((p) => p.team === gs.userTeam && p.draft && p.draft.year >= gs.year - 1);
  return (
    <div className="grid">
      <div className="notice">The amateur draft and international signing period happen at the start of the offseason, after the World Series.</div>
      <div className="card">
        <h3>Your recent signings</h3>
        <table>
          <thead><tr><th className="l">Player</th><th>Pos</th><th>Age</th><th>How</th><th>Bonus</th><th>FV</th></tr></thead>
          <tbody>
            {mine.map((p) => (
              <tr key={p.id}>
                <td className="l"><PlayerLink p={p} /></td><td>{p.pos}</td><td>{age(p, gs.year)}</td>
                <td>{p.draft!.round ? `${p.draft!.year} rd ${p.draft!.round} (#${p.draft!.pick})` : p.draft!.level === 'INTL' ? 'International' : 'Undrafted'}</td>
                <td>{fmtMoney(p.draft!.bonus)}</td><td><Grade p={p} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DraftBoard() {
  const { gs, data, act } = useGame();
  const d = gs.draft!;
  const clock = teamOnClock(gs);
  const onUser = clock.team === gs.userTeam;
  const pool = d.pool.map((id) => gs.players[id]);
  const boardRank = new Map([...pool].sort((a, b) => (b.draftGrade ?? 0) - (a.draftGrade ?? 0)).map((p, i) => [p.id, i + 1]));
  const lvl = scoutingLevel(gs.teams[gs.userTeam]);
  const { sorted, th } = useSorted(pool, {
    rank: (p) => -(boardRank.get(p.id) ?? 999), fv: (p) => perceivedFV(p, lvl, gs.year + 1, data), age: (p) => age(p, gs.year + 1),
    pos: (p) => p.pos, name: (p) => p.name,
  }, 'rank');

  const pick = (p: Player) =>
    act((g) => {
      draftPlayer(g, data, p.id);
      autoDraft(g, data);
    });

  return (
    <div className="grid">
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{gs.year + 1} Amateur Draft: Round {clock.round}, pick {clock.overall}</div>
          <div className="muted">
            On the clock: <b>{gs.teams[clock.team].city} {gs.teams[clock.team].name}</b> · slot bonus {fmtMoney(slotBonus(clock.overall, gs.year))}
          </div>
        </div>
        <button onClick={() => act((g) => autoDraft(g, data, true))}>Let scouting director finish</button>
      </div>
      <div className="notice">
        Prospects come with what clubs knew on draft day: position, school, age, size and where the industry ranked them (“Board”).
        FV is <b>your</b> scouts' read on future value. Bigger scouting budgets see through the noise better. Round 1 slots cost millions in bonuses.
      </div>
      <div className="grid g2">
        <div className="card" style={{ maxHeight: 700, overflowY: 'auto' }}>
          <h3>Available ({pool.length})</h3>
          <table>
            <thead>
              <tr>{th('rank', 'Board', 'l')}{th('name', 'Name', 'l')}{th('pos', 'Pos')}<th>From</th>{th('age', 'Age')}<th>B/T</th><th>Size</th>{th('fv', 'FV')}<th /></tr>
            </thead>
            <tbody>
              {sorted.slice(0, 200).map((p) => (
                <tr key={p.id}>
                  <td className="l">{boardRank.get(p.id)}</td>
                  <td className="l"><PlayerLink p={p} /></td>
                  <td>{p.pos}</td>
                  <td>{LEVEL[p.school ?? 'HS']}</td>
                  <td>{age(p, gs.year + 1)}</td>
                  <td>{p.bats}/{p.throws}</td>
                  <td>{height(p.ht)} {p.wt}</td>
                  <td><Grade p={p} /></td>
                  <td>{onUser && <button className="small primary" onClick={() => pick(p)}>Draft</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ maxHeight: 700, overflowY: 'auto' }}>
          <h3>Draft log</h3>
          <table>
            <tbody>
              {[...d.log].reverse().map((l) => {
                const p = gs.players[l.player];
                return (
                  <tr key={l.pick} className={l.team === gs.userTeam ? 'me' : ''}>
                    <td className="l">#{l.pick}</td><td className="l">{gs.teams[l.team].abbr}</td>
                    <td className="l">{p ? <PlayerLink p={p} /> : '—'}</td><td>{p?.pos}</td><td className="muted">{p ? LEVEL[p.school ?? 'HS'] : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function IntlBoard() {
  const { gs, data, act } = useGame();
  const [msg, setMsg] = useState<string | null>(null);
  const pool = (gs.intlPool ?? []).map((id) => gs.players[id]);
  const spent = gs.intlSpent?.[gs.userTeam] ?? 0;
  const cap = INTL_POOL * inflation(gs.year);
  const lvl = scoutingLevel(gs.teams[gs.userTeam]);
  const { sorted, th } = useSorted(pool, {
    fv: (p) => perceivedFV(p, lvl, gs.year + 1, data), bonus: (p) => intlBonus(p, gs.year + 1), age: (p) => age(p, gs.year + 1),
    name: (p) => p.name, pos: (p) => p.pos,
  }, 'bonus');
  return (
    <div className="grid">
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>International signing period</div>
          <div className="muted">Bonus pool: {fmtMoney(cap - spent)} of {fmtMoney(cap)} remaining. Other clubs sign after you finish.</div>
        </div>
      </div>
      {msg && <div className="notice err">{msg}</div>}
      <div className="card">
        <table>
          <thead><tr>{th('name', 'Name', 'l')}{th('pos', 'Pos')}{th('age', 'Age')}<th>B/T</th><th>Size</th>{th('fv', 'FV')}{th('bonus', 'Bonus ask')}<th /></tr></thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td className="l"><PlayerLink p={p} /></td><td>{p.pos}</td><td>{age(p, gs.year + 1)}</td><td>{p.bats}/{p.throws}</td>
                <td>{height(p.ht)} {p.wt}</td><td><Grade p={p} /></td><td>{fmtMoney(intlBonus(p, gs.year + 1))}</td>
                <td><button className="small primary" onClick={() => act((g) => setMsg(signIntl(g, p.id)))}>Sign</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
