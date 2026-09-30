import { playoffSeeds, standings } from '../engine/season';
import type { Series } from '../engine/types';
import { pct } from './format';
import { useGame } from './GameContext';

export function StandingsView() {
  const { gs } = useGame();
  const rounds = ['Wild Card', 'Division Series', 'Championship Series'];

  const seriesBox = (s: Series, i: number) => {
    const a = gs.teams[s.a], b = gs.teams[s.b];
    const aWon = s.done && s.winsA > s.winsB, bWon = s.done && s.winsB > s.winsA;
    return (
      <div className="series" key={i}>
        <div className={aWon ? 'w' : ''}>{a.abbr} {s.winsA}</div>
        <div className={bWon ? 'w' : ''}>{b.abbr} {s.winsB}</div>
      </div>
    );
  };

  return (
    <div className="grid">
      {gs.postseason.length > 0 && (
        <div className="card">
          <h3>{gs.year} postseason</h3>
          <div className="bracket">
            {rounds.map((r) => (
              <div key={r}>
                <div className="muted" style={{ marginBottom: 6 }}>{r}</div>
                {gs.postseason.filter((s) => s.round.endsWith(r)).map(seriesBox)}
              </div>
            ))}
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>World Series</div>
              {gs.postseason.filter((s) => s.round === 'World Series').map(seriesBox)}
              {gs.champion !== undefined && <div className="good" style={{ fontWeight: 700 }}>🏆 {gs.teams[gs.champion].city} {gs.teams[gs.champion].name}</div>}
            </div>
          </div>
        </div>
      )}
      <div className="grid g2">
        {(['AL', 'NL'] as const).map((lg) => {
          const all = standings(gs, lg);
          const seeds = playoffSeeds(gs, lg);
          return (
            <div className="card" key={lg}>
              <h3>{lg === 'AL' ? 'American League' : 'National League'}</h3>
              {(['East', 'Central', 'West'] as const).map((d) => {
                const div = all.filter((t) => t.division === d);
                const lead = div[0];
                return (
                  <table key={d} style={{ marginBottom: 14 }}>
                    <thead><tr><th className="l">{d}</th><th>W</th><th>L</th><th>Pct</th><th>GB</th><th>Last yr</th></tr></thead>
                    <tbody>
                      {div.map((t) => (
                        <tr key={t.id} className={t.id === gs.userTeam ? 'me' : ''}>
                          <td className="l">
                            {t.city} {t.name}
                            {gs.week > 0 && seeds.includes(t.id) && <span className="tag new">#{seeds.indexOf(t.id) + 1}</span>}
                          </td>
                          <td>{t.w}</td><td>{t.l}</td><td>{pct(t.w, t.l)}</td>
                          <td>{t === lead ? '—' : ((lead.w - t.w + (t.l - lead.l)) / 2).toFixed(1)}</td>
                          <td className="muted">{t.lastW}-{t.lastL}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
