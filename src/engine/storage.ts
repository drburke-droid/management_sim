import { del, get, set } from 'idb-keyval';
import type { GameState } from './types';

const KEY = 'front-office-save-v1';

export async function saveGame(gs: GameState) {
  await set(KEY, gs);
}

export async function loadGame(): Promise<GameState | undefined> {
  return get<GameState>(KEY);
}

export async function deleteGame() {
  await del(KEY);
}

export function exportGame(gs: GameState) {
  const blob = new Blob([JSON.stringify(gs)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `front-office-${gs.teams[gs.userTeam].abbr}-${gs.year}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
