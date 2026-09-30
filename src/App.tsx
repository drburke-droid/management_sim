import { useEffect, useState } from 'react';
import { clearCareerCache } from './engine/career';
import { loadStaticData } from './engine/data';
import { deleteGame, loadGame, saveGame } from './engine/storage';
import type { GameState, StaticData } from './engine/types';
import { GameProvider } from './ui/GameContext';
import { NewGame } from './ui/NewGame';
import { Shell } from './ui/Shell';

export default function App() {
  const [data, setData] = useState<StaticData | null>(null);
  const [gs, setGs] = useState<GameState | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadStaticData()
      .then(setData)
      .catch((e) => setErr(`Could not load player data (${e}). Run "npm run data" first.`));
    loadGame()
      .then((g) => setGs(g ?? null))
      .catch(() => setGs(null));
  }, []);

  if (err) return <div className="center notice err">{err}</div>;
  if (!data || gs === undefined) return <div className="center muted">Loading 60 years of baseball…</div>;

  if (!gs)
    return (
      <NewGame
        data={data}
        onStart={(g) => {
          void saveGame(g);
          setGs(g);
        }}
      />
    );

  return (
    <GameProvider
      gs={gs}
      data={data}
      quit={() => {
        if (!confirm('Abandon this franchise and start over? Your save will be deleted.')) return;
        void deleteGame();
        clearCareerCache();
        setGs(null);
      }}
    >
      <Shell />
    </GameProvider>
  );
}
