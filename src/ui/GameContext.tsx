import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { saveGame } from '../engine/storage';
import type { GameState, StaticData } from '../engine/types';

interface Ctx {
  gs: GameState;
  data: StaticData;
  version: number;
  /** mutate the game state, re-render and autosave */
  act: (fn: (gs: GameState) => void) => void;
  openPlayer: (id: number | null) => void;
  playerId: number | null;
  tab: string;
  setTab: (t: string) => void;
  quit: () => void;
}

const GameCtx = createContext<Ctx | null>(null);

export function GameProvider(props: { gs: GameState; data: StaticData; children: ReactNode; quit: () => void; initialTab?: string }) {
  const ref = useRef(props.gs);
  const [version, setVersion] = useState(0);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [tab, setTab] = useState(props.initialTab ?? 'dashboard');
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    ref.current = props.gs;
    setVersion((v) => v + 1);
  }, [props.gs]);

  const act = useCallback((fn: (gs: GameState) => void) => {
    fn(ref.current);
    setVersion((v) => v + 1);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveGame(ref.current), 400);
  }, []);

  return (
    <GameCtx.Provider
      value={{ gs: ref.current, data: props.data, version, act, openPlayer: setPlayerId, playerId, tab, setTab, quit: props.quit }}
    >
      {props.children}
    </GameCtx.Provider>
  );
}

export function useGame() {
  const c = useContext(GameCtx);
  if (!c) throw new Error('useGame outside provider');
  return c;
}
