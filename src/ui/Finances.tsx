import {
  EXPENSE_KEYS, REVENUE_KEYS, cbtThreshold, deadMoneyOf, expenses, gameDemand, payrollOf, perFanSpend, refTicketPrice, revenue,
} from '../engine/finance';
import type { Finance, Ledger } from '../engine/types';
import { fmtMoney } from '../engine/value';
import { useGame } from './GameContext';

const LABELS: Record<string, string> = {
  tickets: 'Ticket sales', concessions: 'Concessions & parking', merch: 'Merchandise', sponsors: 'Sponsorships',
  localTV: 'Local TV & radio', national: 'National media & league', postseason: 'Postseason gate', revShare: 'Revenue sharing (net)',
  payroll: 'Player payroll', deadMoney: 'Dead money', luxuryTax: 'Luxury tax', minors: 'Minor league operations',
  bonuses: 'Draft & international bonuses', scouting: 'Scouting', development: 'Player development', medical: 'Medical & training',
  marketing: 'Marketing', stadium: 'Stadium operations', frontOffice: 'Front office, travel & benefits', interest: 'Debt interest',
};

type BudgetKey = 'marketing' | 'scouting' | 'development' | 'medical';
const BUDGETS: [BudgetKey, string, number, number, string][] = [
  ['marketing', 'Marketing', 0, 40e6, 'Fills seats and slowly builds fan interest.'],
  ['scouting', 'Scouting', 2e6, 25e6, 'Sharper prospect grades for the draft, international market and trades.'],
  ['development', 'Player development', 3e6, 30e6, 'Young players (26 and under) on your club outperform or underperform their track.'],
  ['medical', 'Medical & training', 1e6, 20e6, 'Shorter injured-list stints.'],
];

export function FinanceView() {
  const { gs, act } = useGame();
  const t = gs.teams[gs.userTeam];
  const f = t.fin;
  const last = f.history[f.history.length - 1];
  const ref = refTicketPrice(t, gs.year);
  const gp = t.w + t.l;
  const demand = gameDemand(t, gs.year, gp ? t.w / gp : 0.5, gp, 0);
  const payroll = payrollOf(gs, t.id);
  const cbt = cbtThreshold(gs.year);

  const set = (fn: (f: Finance) => void) => act((g) => fn(g.teams[g.userTeam].fin));

  const line = (k: keyof Ledger, L: Ledger | undefined) => (L ? fmtMoney(L[k]) : '—');

  return (
    <div className="grid g2">
      <div className="card">
        <h3>Ballpark pricing</h3>
        <div style={{ marginBottom: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Average ticket price</span>
            <b>${f.ticketPrice}</b>
          </div>
          <input type="range" min={10} max={Math.round(ref * 3)} value={f.ticketPrice} onChange={(e) => set((x) => (x.ticketPrice = +e.target.value))} />
          <div className="muted" style={{ fontSize: 12 }}>
            Market rate ~${ref}. Pricing far above it sells fewer seats and irritates fans. Projected demand at this price:{' '}
            <b>{Math.round(demand * 100)}%</b> of {t.capacity.toLocaleString()} seats.
          </div>
        </div>
        <div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Concession & parking pricing</span>
            <b>{Math.round(f.concessionMult * 100)}%</b>
          </div>
          <input type="range" min={60} max={180} value={Math.round(f.concessionMult * 100)} onChange={(e) => set((x) => (x.concessionMult = +e.target.value / 100))} />
          <div className="muted" style={{ fontSize: 12 }}>
            Fans spend about ${perFanSpend(t, gs.year).toFixed(0)} each. Gouging costs some attendance and fan goodwill.
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Department budgets (annual)</h3>
        {BUDGETS.map(([k, label, min, max, help]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>{label}</span>
              <b>{fmtMoney(f[k])}</b>
            </div>
            <input type="range" min={min} max={max} step={250_000} value={f[k]} onChange={(e) => set((x) => (x[k] = +e.target.value))} />
            <div className="muted" style={{ fontSize: 12 }}>{help}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Income statement</h3>
        <table>
          <thead><tr><th className="l" /><th>{gs.year} to date</th><th>{last ? last.year : 'Last year'}</th></tr></thead>
          <tbody>
            {REVENUE_KEYS.map((k) => (
              <tr key={k}><td className="l">{LABELS[k]}</td><td>{line(k, f.season)}</td><td className="muted">{line(k, last?.ledger)}</td></tr>
            ))}
            <tr><td className="l"><b>Total revenue</b></td><td><b>{fmtMoney(revenue(f.season))}</b></td><td className="muted">{last ? fmtMoney(revenue(last.ledger)) : '—'}</td></tr>
            {EXPENSE_KEYS.map((k) => (
              <tr key={k}><td className="l">{LABELS[k]}</td><td>{line(k, f.season)}</td><td className="muted">{line(k, last?.ledger)}</td></tr>
            ))}
            <tr><td className="l"><b>Total expenses</b></td><td><b>{fmtMoney(expenses(f.season))}</b></td><td className="muted">{last ? fmtMoney(expenses(last.ledger)) : '—'}</td></tr>
            <tr>
              <td className="l"><b>Operating profit</b></td>
              <td className={revenue(f.season) - expenses(f.season) >= 0 ? 'good' : 'bad'}><b>{fmtMoney(revenue(f.season) - expenses(f.season))}</b></td>
              <td className="muted">{last ? fmtMoney(revenue(last.ledger) - expenses(last.ledger)) : '—'}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12 }}>Revenue sharing and luxury tax settle after the World Series.</p>
      </div>

      <div className="card">
        <h3>Balance sheet & obligations</h3>
        <div className="kv">
          <span className="muted">Cash</span><span>{fmtMoney(f.cash)}</span>
          <span className="muted">Debt (6.5% interest)</span><span className={f.debt > 0 ? 'bad' : ''}>{fmtMoney(f.debt)}</span>
          <span className="muted">Active payroll</span><span>{fmtMoney(payroll)}</span>
          <span className="muted">Dead money this year</span><span>{fmtMoney(deadMoneyOf(t))}</span>
          <span className="muted">Luxury tax threshold</span><span className={payroll > cbt ? 'bad' : ''}>{fmtMoney(cbt)}{f.cbtYears > 0 ? ` (${f.cbtYears} yr over)` : ''}</span>
          <span className="muted">Local TV deal</span><span>{fmtMoney(f.tv.annual)}/yr, {f.tv.yearsLeft} yr left</span>
          <span className="muted">Fan interest</span><span>{t.interest}/100</span>
        </div>
        {f.debt > 0 && f.cash > 0 && (
          <button style={{ marginTop: 10 }} onClick={() => set((x) => { const pay = Math.min(x.cash, x.debt); x.cash -= pay; x.debt -= pay; })}>
            Pay down {fmtMoney(Math.min(f.cash, f.debt))} of debt
          </button>
        )}
        <p className="muted" style={{ fontSize: 12 }}>
          When the local TV deal expires it is renegotiated based on your market and how much fans care at that moment.
        </p>
      </div>

      {f.history.length > 0 && (
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3>Franchise history</h3>
          <table>
            <thead><tr><th className="l">Year</th><th>W-L</th><th>Attendance</th><th>Revenue</th><th>Payroll</th><th>Expenses</th><th>Profit</th><th>Franchise value</th></tr></thead>
            <tbody>
              {[...f.history].reverse().map((h) => (
                <tr key={h.year}>
                  <td className="l">{h.year}</td><td>{h.wins}-{h.losses}</td><td>{Math.round(h.attendance).toLocaleString()}</td>
                  <td>{fmtMoney(revenue(h.ledger))}</td><td>{fmtMoney(h.ledger.payroll)}</td><td>{fmtMoney(expenses(h.ledger))}</td>
                  <td className={revenue(h.ledger) - expenses(h.ledger) >= 0 ? 'good' : 'bad'}>{fmtMoney(revenue(h.ledger) - expenses(h.ledger))}</td>
                  <td>{fmtMoney(h.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
