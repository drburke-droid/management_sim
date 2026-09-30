import { cbtThreshold, deadMoneyOf, estimatedRevenue, expenses, franchiseValue, payrollOf, revenue } from '../engine/finance';
import { standings } from '../engine/season';
import { teamPlayers } from '../engine/roster';
import { fmtMoney } from '../engine/value';
import { PlayerLink, projFor, seasonTotals } from './common';
import { pct, r1 } from './format';
import { useGame } from './GameContext';

export function Dashboard() {
  const { gs, data, setTab } = useGame();
  const t = gs.teams[gs.userTeam];
  const L = t.fin.season;
  const rev = revenue(L), exp = expenses(L);
  const payroll = payrollOf(gs, t.id);
  const cbt = cbtThreshold(gs.year);
  const lastRev = t.fin.history.length ? revenue(t.fin.history[t.fin.history.length - 1].ledger) : estimatedRevenue(t, gs.year);
  const value = franchiseValue(t, Math.max(lastRev, rev));
  const div = standings(gs, t.league).filter((x) => x.division === t.division);
  const leader = div[0];
  const players = teamPlayers(gs, t.id).filter((p) => p.level === 'MLB');
  const projWar = players.reduce((a, p) => a + Math.max(-1, projFor(p, gs, data)), 0);
  const leaders = players
    .map((p) => {
      const s = seasonTotals(p, gs.year);
      return { p, war: (s.hit?.WAR ?? 0) + (s.pit?.WAR ?? 0) };
    })
    .sort((a, b) => b.war - a.war)
    .slice(0, 6);
  const netWorth = t.fin.cash - t.fin.debt + value;

  return (
    <div className="grid g2">
      <div className="card">
        <h3>{gs.year} season</h3>
        <div className="row" style={{ gap: 30 }}>
          <div><div className="big">{t.w}-{t.l}</div><div className="muted">{pct(t.w, t.l)} · {t.league} {t.division}</div></div>
          <div>
            <div className="big">{leader.id === t.id ? '1st' : `${((leader.w - t.w + (t.l - leader.l)) / 2).toFixed(1)} GB`}</div>
            <div className="muted">division</div>
          </div>
          <div><div className="big">{projWar.toFixed(0)}</div><div className="muted">scouts' projected team WAR</div></div>
        </div>
        <table style={{ marginTop: 12 }}>
          <thead><tr><th className="l">{t.league} {t.division}</th><th>W</th><th>L</th><th>Pct</th><th>GB</th></tr></thead>
          <tbody>
            {div.map((x) => (
              <tr key={x.id} className={x.id === t.id ? 'me' : ''}>
                <td className="l">{x.city} {x.name}</td><td>{x.w}</td><td>{x.l}</td><td>{pct(x.w, x.l)}</td>
                <td>{x.id === leader.id ? '—' : ((leader.w - x.w + (x.l - leader.l)) / 2).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>The books ({gs.year} to date)</h3>
        <div className="row" style={{ gap: 30 }}>
          <div><div className="big">{fmtMoney(rev)}</div><div className="muted">revenue</div></div>
          <div><div className="big">{fmtMoney(exp)}</div><div className="muted">expenses</div></div>
          <div><div className={`big ${rev - exp >= 0 ? 'good' : 'bad'}`}>{fmtMoney(rev - exp)}</div><div className="muted">operating profit</div></div>
        </div>
        <div className="kv" style={{ marginTop: 12 }}>
          <span className="muted">Active payroll</span>
          <span className={payroll + deadMoneyOf(t) > cbt ? 'bad' : ''}>{fmtMoney(payroll)} <span className="muted">(tax line {fmtMoney(cbt)})</span></span>
          <span className="muted">Avg attendance</span>
          <span>{L.homeGames ? Math.round(L.attendance / L.homeGames).toLocaleString() : '—'} / {t.capacity.toLocaleString()}</span>
          <span className="muted">Fan interest</span>
          <span style={{ width: 160 }}><div className="bar"><div style={{ width: `${t.interest}%` }} /></div></span>
          <span className="muted">Franchise value (est.)</span><span>{fmtMoney(value)}</span>
          <span className="muted">Owner net worth in team</span><span><b>{fmtMoney(netWorth)}</b></span>
        </div>
        <div style={{ marginTop: 10 }}><a onClick={() => setTab('finances')}>Set prices &amp; budgets →</a></div>
      </div>

      <div className="card">
        <h3>Top performers</h3>
        <table>
          <thead><tr><th className="l">Player</th><th>Pos</th><th>Proj</th><th>WAR</th></tr></thead>
          <tbody>
            {leaders.map(({ p, war }) => (
              <tr key={p.id}><td className="l"><PlayerLink p={p} /></td><td>{p.pos}</td><td>{projFor(p, gs, data).toFixed(1)}</td><td>{r1(war)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Front office news</h3>
        <div className="log">
          {[...gs.log].reverse().slice(0, 60).map((l, i) => (
            <div key={i} className={l.kind === 'good' ? 'good' : l.kind === 'bad' ? 'bad' : ''}>
              <span className="muted">{l.year} wk {l.week}:</span> {l.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
