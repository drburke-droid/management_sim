import type { DraftRow, StaticData, Template } from './types';

interface PlayersFile {
  meta: { firstYear: number; lastYear: number };
  players: Template[];
}
interface DraftsFile {
  drafts: Record<string, DraftRow[]>;
}

export function makeStaticData(pf: PlayersFile, df: DraftsFile): StaticData {
  return { players: pf.players, drafts: df.drafts, firstYear: pf.meta.firstYear, lastYear: pf.meta.lastYear };
}

export async function loadStaticData(base = import.meta.env.BASE_URL): Promise<StaticData> {
  const [pf, df] = await Promise.all([
    fetch(`${base}data/players.json`).then((r) => r.json()),
    fetch(`${base}data/drafts.json`).then((r) => r.json()),
  ]);
  return makeStaticData(pf, df);
}
