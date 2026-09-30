import { useState } from 'react';
import { payrollOf } from '../engine/finance';
import { freeAgents, trySignNow } from '../engine/offseason';
import type { Player } from '../engine/types';
import { age, fmtMoney, minSalary, visibleSeasons } from '../engine/value';
import { PlayerLink, Proj, projFor, useSorted } from './common';
import { useGame } from './GameContext';

function lastWar(p: Player, data: Parameters<typeof visibleSeasons>[1]) {
  const v = visibleSeasons(p, data);
  const s = v[v.length - 1];
  return s ? (s.hit?.WAR ?? 0) + (s.pit?.WAR ?? 0) : 0;
}

export function FreeAgentsView() {
  const { gs, data, act } = useGame();
  const [filter, setFilter] = useState<'all' | 'H' | 'P'>('all');
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<number, { salary: string; years: string }>>({});
  const offseason = gs.phase === 'FREE_AGENCY';
  const canSignNow = gs.phase === 'PRESEASON' || gs.phase === 'REGULAR';
  const year = offseason ? gs.year + 1 : gs.year;
  const all = freeAgents(gs).filter((p) => filter === 'all' || (filter === 'P' ? p.role === 'P' : p.role !== 'P'));
  const { sorted, th } = useSorted(all, {
    name: (p) => p.name, age: (p) => age(p, year), proj: (p) => projFor(p, gs, data), last: (p) => lastWar(p, data),
    ask: (p) => p.faAsk?.salary ?? 0,
  }, 'proj');
  const t = gs.teams[gs.userTeam];
  const committed = Object.values(gs.faOffers).reduce((a, o) => a + o.salary, 0);

  const val = (p: Player) => draft[p.id] ?? {
    salary: (((gs.faOffers[p.id]?.salary ?? p.faAsk?.salary ?? minSalary(year)) / 1e6).toFixed(2)),
    years: String(gs.faOffers[p.id]?.years ?? p.faAsk?.years ?? 1),
  };

  return (
    <div className="grid">
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <span>Payroll: <b>{fmtMoney(payrollOf(gs, t.id))}</b></span>
          {offseason && <span>Pending offers: <b>{fmtMoney(committed)}</b>/yr</span>}
          <span>Cash: <b>{fmtMoney(t.fin.cash)}</b></span>
        </div>
        <div className="row">
          {(['all', 'H', 'P'] as const).map((f) => (
            <button key={f} className={`small ${filter === f ? 'primary' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'H' ? 'Hitters' : 'Pitchers'}
            </button>
          ))}
        </div>
      </div>
      <div className="notice">
        {offseason
          ? 'Make offers, then press “Resolve FA round”. Each free agent signs with the best offer he gets. Unsigned players lower their asks each round.'
          : canSignNow
            ? 'Free agents will sign immediately if you meet their asking price.'
            : 'The free agent market opens after the draft and international signing period.'}
      </div>
      {msg && <div className="notice err">{msg}</div>}
      <div className="card">
        <table>
          <thead>
            <tr>
              {th('name', 'Name', 'l')}<th>Pos</th>{th('age', 'Age')}{th('proj', 'Proj WAR')}{th('last', 'Last WAR')}{th('ask', 'Asking')}
              <th>Offer $M/yr</th><th>Years</th><th />
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 250).map((p) => {
              const v = val(p);
              const upd = (k: 'salary' | 'years', x: string) => setDraft({ ...draft, [p.id]: { ...v, [k]: x } });
              const offer = { salary: Math.round(parseFloat(v.salary || '0') * 1e6), years: Math.max(1, Math.min(10, parseInt(v.years || '1'))) };
              return (
                <tr key={p.id} className={gs.faOffers[p.id] ? 'me' : ''}>
                  <td className="l"><PlayerLink p={p} /></td>
                  <td>{p.pos}</td>
                  <td>{age(p, year)}</td>
                  <td><Proj p={p} /></td>
                  <td>{lastWar(p, data).toFixed(1)}</td>
                  <td>{p.faAsk ? `${p.faAsk.years} yr / ${fmtMoney(p.faAsk.salary, 2)}` : '—'}</td>
                  <td><input style={{ width: 80 }} value={v.salary} onChange={(e) => upd('salary', e.target.value)} disabled={!offseason && !canSignNow} /></td>
                  <td><input style={{ width: 50 }} value={v.years} onChange={(e) => upd('years', e.target.value)} disabled={!offseason && !canSignNow} /></td>
                  <td className="l">
                    {offseason && (
                      gs.faOffers[p.id] ? (
                        <button className="small" onClick={() => act((g) => { delete g.faOffers[p.id]; })}>Withdraw</button>
                      ) : (
                        <button className="small" onClick={() => act((g) => { g.faOffers[p.id] = offer; })}>Offer</button>
                      )
                    )}
                    {canSignNow && (
                      <button className="small primary" onClick={() => act((g) => setMsg(trySignNow(g, data, p.id, offer.salary, offer.years)))}>Sign</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length > 250 && <p className="muted">Showing the top 250 of {sorted.length}.</p>}
      </div>
    </div>
  );
}
