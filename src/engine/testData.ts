import { readFileSync } from 'node:fs';
import { makeStaticData } from './data';

export function loadTestData() {
  const pf = JSON.parse(readFileSync('public/data/players.json', 'utf-8'));
  const df = JSON.parse(readFileSync('public/data/drafts.json', 'utf-8'));
  return makeStaticData(pf, df);
}
