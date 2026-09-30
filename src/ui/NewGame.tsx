import { useState } from 'react';
import { newGame } from '../engine/newGame';
import { TEAM_SEEDS } from '../engine/teams';
import type { GameState, StaticData } from '../engine/types';
import { fmtMoney } from '../engine/value';

export function NewGame({ data, onStart }: { data: StaticData; onStart: (g: GameState) => void }) {
  const [pick, setPick] = useState('SEA');
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState('');
  const sel = TEAM_SEEDS.find((t) => t[0] === pick)!;

  const start = () => {
    setBusy(true);
    setTimeout(() => {
      const s = seed.trim() ? Math.abs(hash(seed.trim())) : undefined;
      onStart(newGame(data, pick, s));
    }, 20);
  };

  return (
    <div className="center">
      <h1 className="brand" style={{ fontSize: 34, marginBottom: 4 }}>
        FRONT <span>OFFICE</span>
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Buy a big-league club. Every player is a real MLB career from the last 60 years, disguised with a new name and lightly
        scrambled stats. Win games, fill seats, make money.
      </p>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Choose your franchise</h3>
        {(['AL', 'NL'] as const).map((lg) => (
          <div key={lg} style={{ marginBottom: 12 }}>
            <div className="muted" style={{ margin: '6px 0' }}>{lg === 'AL' ? 'American League' : 'National League'}</div>
            <div className="teams">
              {TEAM_SEEDS.filter((t) => t[3] === lg).map(([abbr, city, name, , div, market]) => (
                <button key={abbr} className={`teambtn ${pick === abbr ? 'on' : ''}`} onClick={() => setPick(abbr)}>
                  <div style={{ fontWeight: 600 }}>{city} {name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {lg} {div} · market {marketLabel(market)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{sel[1]} {sel[2]}</div>
          <div className="muted">
            Market size: {marketLabel(sel[5])} · Ballpark: {sel[6].toLocaleString()} seats · Starting cash:{' '}
            {fmtMoney((40 + 40 * sel[5]) * 1e6)}
          </div>
        </div>
        <div className="row">
          <input placeholder="Random seed (optional)" value={seed} onChange={(e) => setSeed(e.target.value)} />
          <button className="primary" disabled={busy} onClick={start}>
            {busy ? 'Building league…' : 'Buy the team'}
          </button>
        </div>
      </div>
    </div>
  );
}

function marketLabel(m: number) {
  return m >= 1.7 ? 'Huge' : m >= 1.2 ? 'Large' : m >= 0.85 ? 'Medium' : 'Small';
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h || 1;
}
