import type { GameState, Player, StaticData } from '../engine/types';
import { age, etaYears, fmtMoney, visibleSeasons } from '../engine/value';
import { Contract, Grade, Proj, combine, isProspect } from './common';
import { avg, era, height, ip, obp, r0, r1, slg, whip } from './format';
import { useGame } from './GameContext';

function bio(p: Player, gs: GameState) {
  const lvl = p.level === 'MLB' ? 'MLB' : p.level === 'MIN' ? 'Minors' : p.level === 'FA' ? 'Free agent' : p.level === 'RET' ? 'Retired' : 'Amateur';
  return `${p.pos === 'P' ? (p.throws === 'L' ? 'LHP' : 'RHP') : p.pos} · Age ${age(p, gs.year)} · B/T ${p.bats}/${p.throws} · ${height(p.ht)} ${p.wt} lb · ${lvl}${p.team >= 0 ? ` (${gs.teams[p.team].abbr})` : ''}`;
}

export function PlayerModal() {
  const { gs, data, playerId, openPlayer } = useGame();
  const p = gs.players[playerId!];
  const seasons = visibleSeasons(p, data);
  const showHit = p.role !== 'P' && seasons.some((s) => s.hit);
  const showPit = p.role !== 'H' && seasons.some((s) => s.pit);
  const prospect = isProspect(p, data);
  const award = gs.awards.flatMap((a) =>
    [
      a.mvpAL === p.id || a.mvpNL === p.id ? `${a.year} MVP` : null,
      a.cyAL === p.id || a.cyNL === p.id ? `${a.year} Cy Young` : null,
    ].filter(Boolean),
  );

  return (
    <div className="modal-bg" onClick={() => openPlayer(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{p.name}</div>
            <div className="muted">{bio(p, gs)}</div>
            {award.length > 0 && <div className="good" style={{ marginTop: 4 }}>🏆 {award.join(' · ')}</div>}
          </div>
          <button onClick={() => openPlayer(null)}>Close</button>
        </div>

        <div className="grid g3" style={{ marginTop: 14 }}>
          <div className="card">
            <h3>Contract</h3>
            <div className="kv">
              <span className="muted">Salary</span><Contract p={p} />
              <span className="muted">MLB service</span><span>{p.service.toFixed(2)} yrs</span>
              {p.faAsk && (<><span className="muted">Asking</span><span>{p.faAsk.years} yr / {fmtMoney(p.faAsk.salary, 2)}</span></>)}
            </div>
          </div>
          <div className="card">
            <h3>Scouting</h3>
            <div className="kv">
              <span className="muted">Projected WAR</span><Proj p={p} />
              {prospect && (<><span className="muted">Future value (20-80)</span><Grade p={p} /></>)}
              {prospect && (<><span className="muted">ETA</span><span>{etaYears(p, gs.year, data) === 0 ? 'Ready now' : gs.year + etaYears(p, gs.year, data)}</span></>)}
            </div>
          </div>
          <div className="card">
            <h3>Background</h3>
            <div className="kv">
              {p.draft ? (
                <>
                  <span className="muted">Signed</span>
                  <span>
                    {p.draft.round ? `${p.draft.year} draft, rd ${p.draft.round} (#${p.draft.pick})` : p.draft.level === 'INTL' ? `${p.draft.year} international` : `${p.draft.year} undrafted`}
                  </span>
                  <span className="muted">By</span><span>{p.draft.team}</span>
                  <span className="muted">Bonus</span><span>{fmtMoney(p.draft.bonus)}</span>
                </>
              ) : (
                <><span className="muted">Origin</span><span>{p.intl ? 'International' : 'Domestic'}</span></>
              )}
              {p.school && (<><span className="muted">Amateur level</span><span>{{ HS: 'High school', JC: 'Junior college', '4Y': 'College' }[p.school]}</span></>)}
            </div>
          </div>
        </div>

        {showHit && <HitTable p={p} data={data} />}
        {showPit && <PitTable p={p} data={data} />}
        {!showHit && !showPit && <p className="muted">No major league experience yet.</p>}
      </div>
    </div>
  );
}

function yearOf(p: Player, a: number) {
  // pre-game seasons are shown relative to the game's calendar
  return p.born + a;
}

function HitTable({ p, data }: { p: Player; data: StaticData }) {
  const rows = visibleSeasons(p, data).filter((s) => s.hit);
  const tot = combine(rows).hit!;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>Batting</h3>
      <table>
        <thead>
          <tr>
            <th className="l">Year</th><th>Age</th><th className="l">Tm</th><th>G</th><th>PA</th><th>R</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>RBI</th>
            <th>SB</th><th>BB</th><th>SO</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS+</th><th>WAR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const h = s.hit!;
            return (
              <tr key={i}>
                <td className="l">{yearOf(p, s.age)}</td><td>{s.age}</td><td className="l">{s.team ?? <span className="muted">prior</span>}</td>
                <td>{r0(h.G)}</td><td>{r0(h.PA)}</td><td>{r0(h.R)}</td><td>{r0(h.H)}</td><td>{r0(h.D)}</td><td>{r0(h.T)}</td><td>{r0(h.HR)}</td>
                <td>{r0(h.RBI)}</td><td>{r0(h.SB)}</td><td>{r0(h.BB)}</td><td>{r0(h.SO)}</td><td>{avg(h)}</td><td>{obp(h)}</td><td>{slg(h)}</td>
                <td>{r0(h.OPSP)}</td><td><b>{r1(h.WAR)}</b></td>
              </tr>
            );
          })}
          <tr>
            <td className="l"><b>Career</b></td><td /><td /><td>{r0(tot.G)}</td><td>{r0(tot.PA)}</td><td>{r0(tot.R)}</td><td>{r0(tot.H)}</td><td>{r0(tot.D)}</td>
            <td>{r0(tot.T)}</td><td>{r0(tot.HR)}</td><td>{r0(tot.RBI)}</td><td>{r0(tot.SB)}</td><td>{r0(tot.BB)}</td><td>{r0(tot.SO)}</td>
            <td>{avg(tot)}</td><td>{obp(tot)}</td><td>{slg(tot)}</td><td>{r0(tot.OPSP)}</td><td><b>{r1(tot.WAR)}</b></td>
          </tr>
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 12 }}>
        OPS+ is era-adjusted (100 = league average); raw lines reflect the run environment the hitter came from.
      </p>
    </div>
  );
}

function PitTable({ p, data }: { p: Player; data: StaticData }) {
  const rows = visibleSeasons(p, data).filter((s) => s.pit);
  const tot = combine(rows).pit!;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>Pitching</h3>
      <table>
        <thead>
          <tr>
            <th className="l">Year</th><th>Age</th><th className="l">Tm</th><th>W</th><th>L</th><th>ERA</th><th>G</th><th>GS</th><th>SV</th><th>IP</th>
            <th>H</th><th>HR</th><th>BB</th><th>SO</th><th>WHIP</th><th>ERA+</th><th>WAR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const x = s.pit!;
            return (
              <tr key={i}>
                <td className="l">{yearOf(p, s.age)}</td><td>{s.age}</td><td className="l">{s.team ?? <span className="muted">prior</span>}</td>
                <td>{r0(x.W)}</td><td>{r0(x.L)}</td><td>{era(x)}</td><td>{r0(x.G)}</td><td>{r0(x.GS)}</td><td>{r0(x.SV)}</td><td>{ip(x)}</td>
                <td>{r0(x.H)}</td><td>{r0(x.HR)}</td><td>{r0(x.BB)}</td><td>{r0(x.SO)}</td><td>{whip(x)}</td><td>{r0(x.ERAP)}</td><td><b>{r1(x.WAR)}</b></td>
              </tr>
            );
          })}
          <tr>
            <td className="l"><b>Career</b></td><td /><td /><td>{r0(tot.W)}</td><td>{r0(tot.L)}</td><td>{era(tot)}</td><td>{r0(tot.G)}</td><td>{r0(tot.GS)}</td>
            <td>{r0(tot.SV)}</td><td>{ip(tot)}</td><td>{r0(tot.H)}</td><td>{r0(tot.HR)}</td><td>{r0(tot.BB)}</td><td>{r0(tot.SO)}</td><td>{whip(tot)}</td>
            <td>{r0(tot.ERAP)}</td><td><b>{r1(tot.WAR)}</b></td>
          </tr>
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 12 }}>
        ERA+ is era-adjusted (100 = league average); raw lines reflect the run environment the pitcher came from.
      </p>
    </div>
  );
}
