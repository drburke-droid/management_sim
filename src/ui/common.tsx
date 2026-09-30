import { useMemo, useState, type ReactNode } from 'react';
import { getCareer } from '../engine/career';
import type { GameSeason, GameState, HitLine, PitLine, Player, StaticData } from '../engine/types';
import { age, etaYears, fmtMoney, perceivedFV, projectWar, scoutingLevel, visibleSeasons } from '../engine/value';
import { useGame } from './GameContext';

export function PlayerLink({ p }: { p: Player }) {
  const { openPlayer } = useGame();
  return (
    <a onClick={() => openPlayer(p.id)}>
      {p.name}
      {p.injuredWeeks > 0 && <span className="tag il">IL {p.injuredWeeks}w</span>}
    </a>
  );
}

export function teamAbbr(gs: GameState, p: Player) {
  return p.team >= 0 ? gs.teams[p.team].abbr : p.level === 'FA' ? 'FA' : '—';
}

/** Current-season totals across all teams the player played for. */
export function seasonTotals(p: Player, year: number): { hit?: HitLine; pit?: PitLine } {
  const rows = p.hist.filter((h) => h.year === year);
  return combine(rows);
}

export function combine(rows: GameSeason[] | { hit?: HitLine; pit?: PitLine }[]): { hit?: HitLine; pit?: PitLine } {
  let hit: HitLine | undefined, pit: PitLine | undefined;
  for (const r of rows) {
    if (r.hit) {
      if (!hit) hit = { ...r.hit, OPSP: r.hit.OPSP * r.hit.PA };
      else {
        for (const k of Object.keys(r.hit) as (keyof HitLine)[]) if (k !== 'OPSP') hit[k] += r.hit[k];
        hit.OPSP += r.hit.OPSP * r.hit.PA;
      }
    }
    if (r.pit) {
      if (!pit) pit = { ...r.pit, ERAP: r.pit.ERAP * r.pit.OUTS };
      else {
        for (const k of Object.keys(r.pit) as (keyof PitLine)[]) if (k !== 'ERAP') pit[k] += r.pit[k];
        pit.ERAP += r.pit.ERAP * r.pit.OUTS;
      }
    }
  }
  if (hit) hit.OPSP = hit.PA ? hit.OPSP / hit.PA : 0;
  if (pit) pit.ERAP = pit.OUTS ? pit.ERAP / pit.OUTS : 0;
  return { hit, pit };
}

export function isProspect(p: Player, data: StaticData) {
  return !visibleSeasons(p, data).some((s) => (s.hit?.PA ?? 0) >= 130 || (s.pit?.OUTS ?? 0) >= 150);
}

export function Grade({ p }: { p: Player }) {
  const { gs, data } = useGame();
  const fv = perceivedFV(p, scoutingLevel(gs.teams[gs.userTeam]), gs.phase === 'DRAFT' || gs.phase === 'INTL' || gs.phase === 'FREE_AGENCY' ? gs.year + 1 : gs.year, data);
  const cls = fv >= 60 ? 'good' : fv >= 50 ? '' : 'muted';
  return <span className={`grade ${cls}`}>{fv}</span>;
}

export function projFor(p: Player, gs: GameState, data: StaticData) {
  const offseason = ['DONE', 'DRAFT', 'INTL', 'FREE_AGENCY'].includes(gs.phase);
  return projectWar(p, offseason ? gs.year + 1 : gs.year, data, gs);
}

export function Proj({ p }: { p: Player }) {
  const { gs, data } = useGame();
  const v = projFor(p, gs, data);
  return <span className={v >= 4 ? 'good' : v < 0 ? 'bad' : ''}>{v.toFixed(1)}</span>;
}

export function Contract({ p }: { p: Player }) {
  if (p.contract.kind === 'minor') return <span className="muted">minors</span>;
  return (
    <span>
      {fmtMoney(p.contract.salary, 2)}
      <span className="muted"> ×{p.contract.years} {p.contract.kind === 'pre' ? 'pre-arb' : p.contract.kind === 'arb' ? 'arb' : ''}</span>
    </span>
  );
}

export function Eta({ p }: { p: Player }) {
  const { gs, data } = useGame();
  const e = etaYears(p, gs.year, data);
  const c = getCareer(p, data);
  if (c.debutAge === null && age(p, gs.year) >= 24) return <span className="muted">org depth</span>;
  return <span>{e === 0 ? 'Ready' : `${gs.year + e}`}</span>;
}

export type SortDir = 1 | -1;

export function useSorted<T>(rows: T[], cols: Record<string, (r: T) => number | string>, initial: string, dir: SortDir = -1) {
  const [key, setKey] = useState(initial);
  const [d, setD] = useState<SortDir>(dir);
  const sorted = useMemo(() => {
    const f = cols[key];
    if (!f) return rows;
    return [...rows].sort((a, b) => {
      const x = f(a), y = f(b);
      if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y)) * d;
      return (x - y) * d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key, d]);
  const th = (k: string, label: ReactNode, cls = '') => (
    <th
      className={`sort ${cls}`}
      onClick={() => {
        if (k === key) setD((x) => (x === 1 ? -1 : 1));
        else {
          setKey(k);
          setD(-1);
        }
      }}
    >
      {label}
      {k === key ? (d === -1 ? ' ▾' : ' ▴') : ''}
    </th>
  );
  return { sorted, th };
}
