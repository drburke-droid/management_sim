import type { HitLine, PitLine } from '../engine/types';

export const r0 = (x: number) => Math.round(x).toString();
export const r1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

function rate3(x: number) {
  if (!isFinite(x)) return '---';
  return x.toFixed(3).replace(/^0/, '');
}

export function avg(h: HitLine) {
  return rate3(h.AB ? h.H / h.AB : 0);
}
export function obp(h: HitLine) {
  const d = h.AB + h.BB + h.HBP + h.SF;
  return rate3(d ? (h.H + h.BB + h.HBP) / d : 0);
}
export function slg(h: HitLine) {
  const tb = h.H + h.D + 2 * h.T + 3 * h.HR;
  return rate3(h.AB ? tb / h.AB : 0);
}
export function ip(p: PitLine) {
  const outs = Math.round(p.OUTS);
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}
export function era(p: PitLine) {
  return p.OUTS ? ((p.ER * 27) / p.OUTS).toFixed(2) : '-.--';
}
export function whip(p: PitLine) {
  return p.OUTS ? (((p.H + p.BB) * 3) / p.OUTS).toFixed(2) : '-.--';
}
export function height(inches: number) {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
export function pct(w: number, l: number) {
  return w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '.000';
}
