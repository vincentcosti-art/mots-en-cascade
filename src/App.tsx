import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { LEVELS, TOTAL_LEVELS } from './game/data';
import { difficultyLabel, targetSeconds } from './game/difficulty';
import { calculateReward, HINT_COSTS, canAfford, type HintKind, type RewardBreakdown } from './game/economy';
import { createRound, elapsedSeconds, selectWord, type RoundState } from './game/engine';
import { claimReward, defaultSave, loadSave, saveSave } from './game/storage';
import type { Family, PlayerSave } from './game/types';
import './App.css';

type Screen = 'home' | 'map' | 'daily' | 'stats' | 'shop' | 'settings' | 'game' | 'victory';
type Feedback = { kind: 'correct' | 'wrong'; label?: string; words: string[] } | null;

const today = () => new Date().toISOString().slice(0, 10);
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

function App() {
  const [save, setSave] = useState<PlayerSave>(() => loadSave());
  const [screen, setScreen] = useState<Screen>('home');
  const [levelId, setLevelId] = useState(() => Math.min(TOTAL_LEVELS, Math.max(1, loadSave().currentLevel)));
  const [round, setRound] = useState<RoundState>(() => createRound(LEVELS[Math.min(TOTAL_LEVELS, Math.max(1, loadSave().currentLevel)) - 1]));
  const [seconds, setSeconds] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [hintWords, setHintWords] = useState<string[]>([]);
  const [hintLabel, setHintLabel] = useState<string | null>(null);
  const [victory, setVictory] = useState<{ reward: RewardBreakdown; elapsed: number; errors: number; hints: number; levelId: number } | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const completionHandled = useRef(false);
  const level = LEVELS[levelId - 1] ?? LEVELS[0];
  const solvedFamilies = useMemo(() => new Set(round.solvedFamilyIds), [round.solvedFamilyIds]);
  const progress = Math.round((save.completedLevels.length / TOTAL_LEVELS) * 100);

  useEffect(() => {
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    window.addEventListener('online', onlineHandler); window.addEventListener('offline', offlineHandler);
    return () => { window.removeEventListener('online', onlineHandler); window.removeEventListener('offline', offlineHandler); };
  }, []);

  useEffect(() => {
    if (screen !== 'game' || round.finishedAt) return undefined;
    const timer = window.setInterval(() => setSeconds(elapsedSeconds(round)), 1000);
    return () => window.clearInterval(timer);
  }, [screen, round]);

  const vibrate = async (style: ImpactStyle = ImpactStyle.Light) => {
    if (!save.settings.haptics) return;
    try { if (Capacitor.isNativePlatform()) await Haptics.impact({ style }); else navigator.vibrate?.(style === ImpactStyle.Heavy ? 45 : 15); } catch { /* haptics are optional */ }
  };

  const persist = (next: PlayerSave) => { setSave(next); saveSave(next); };

  const startLevel = (id: number) => {
    const safeId = Math.min(TOTAL_LEVELS, Math.max(1, id));
    setLevelId(safeId); setRound(createRound(LEVELS[safeId - 1])); setSeconds(0); setFeedback(null); setHintWords([]); setHintLabel(null); setVictory(null); completionHandled.current = false; setScreen('game');
  };

  const completeRound = (completedRound: RoundState) => {
    if (completionHandled.current || completedRound.solvedFamilyIds.length !== level.families.length) return;
    completionHandled.current = true;
    const elapsed = elapsedSeconds(completedRound);
    const previous = save.results[String(level.id)];
    const improved = !previous || elapsed < previous.bestTimeSeconds || completedRound.errors < previous.bestErrors;
    const reward = calculateReward({ levelId: level.id, difficulty: level.difficulty, elapsedSeconds: elapsed, errors: completedRound.errors, hintsUsed: completedRound.hintsUsed, streak: save.streak, firstCompletion: !save.completedLevels.includes(level.id), improvedRecord: improved });
    const next = claimReward(save, level.id, reward, elapsed, completedRound.errors, completedRound.hintsUsed, improved);
    persist(next);
    setVictory({ reward, elapsed, errors: completedRound.errors, hints: completedRound.hintsUsed, levelId: level.id });
    window.setTimeout(() => setScreen('victory'), save.settings.reducedMotion ? 80 : 420);
  };

  const handleWord = async (word: string) => {
    if (feedback?.kind === 'correct' || round.finishedAt) return;
    const result = selectWord(level, round, word);
    setRound(result.state);
    if (result.correct) {
      await vibrate(ImpactStyle.Medium);
      setFeedback({ kind: 'correct', label: result.family?.label, words: result.selected });
      window.setTimeout(() => setFeedback(null), save.settings.reducedMotion ? 150 : 650);
    } else if (result.selected.length === 4) {
      await vibrate(ImpactStyle.Heavy);
      setFeedback({ kind: 'wrong', words: result.selected });
      window.setTimeout(() => setFeedback(null), save.settings.reducedMotion ? 100 : 500);
    }
    if (result.completed) completeRound(result.state);
  };

  const useHint = (kind: HintKind) => {
    if (save.inventory[kind] <= 0) return;
    const unsolved = level.families.find((family) => !solvedFamilies.has(family.id));
    if (!unsolved) return;
    const nextSave = { ...save, inventory: { ...save.inventory, [kind]: save.inventory[kind] - 1 } };
    persist(nextSave);
    setRound((current) => ({ ...current, hintsUsed: current.hintsUsed + 1 }));
    if (kind === 'pair') setHintWords(unsolved.words.slice(0, 2));
    if (kind === 'label') setHintLabel(unsolved.label);
    if (kind === 'solve') {
      let current = { ...round, hintsUsed: round.hintsUsed + 1 };
      unsolved.words.forEach((word) => { current = selectWord(level, current, word).state; });
      setRound(current);
      setFeedback({ kind: 'correct', label: unsolved.label, words: unsolved.words });
      window.setTimeout(() => setFeedback(null), 700);
      if (current.solvedFamilyIds.length === level.families.length) completeRound(current);
    }
  };

  const claimDaily = () => {
    if (save.lastDailyClaim === today()) return;
    persist({ ...save, coins: save.coins + 35, xp: save.xp + 10, lastDailyClaim: today() });
  };

  const buyHint = (kind: HintKind) => {
    if (!canAfford(save.coins, kind)) return;
    persist({ ...save, coins: save.coins - HINT_COSTS[kind], inventory: { ...save.inventory, [kind]: save.inventory[kind] + 1 } });
  };

  const toggleSetting = (key: keyof PlayerSave['settings']) => persist({ ...save, settings: { ...save.settings, [key]: !save.settings[key] } });

  const resetProgress = () => {
    if (!window.confirm('Effacer la progression locale et recommencer au niveau 1 ?')) return;
    const fresh = defaultSave(); persist(fresh); setLevelId(1); setRound(createRound(LEVELS[0])); setScreen('home');
  };

  return <div className={`app ${save.settings.reducedMotion ? 'reduce-motion' : ''}`}>
    <header className="topbar">
      <button className="brand" onClick={() => setScreen('home')} aria-label="Accueil"><span className="brand-mark"><i /><i /><i /></span><span>Mots en <b>Cascade</b></span></button>
      <div className="top-actions"><span className={`offline-pill ${online ? 'is-online' : ''}`}><span className="status-dot" />{online ? 'Hors-ligne prêt' : 'Hors-ligne'}</span><span className="coin-balance">◈ {save.coins}</span></div>
    </header>
    <main className="main-content">
      {screen === 'home' && <HomeScreen save={save} progress={progress} onPlay={() => startLevel(save.currentLevel)} onMap={() => setScreen('map')} onDaily={() => setScreen('daily')} onStats={() => setScreen('stats')} />}
      {screen === 'map' && <MapScreen save={save} onBack={() => setScreen('home')} onStart={startLevel} />}
      {screen === 'daily' && <DailyScreen save={save} claimed={save.lastDailyClaim === today()} onClaim={claimDaily} onBack={() => setScreen('home')} />}
      {screen === 'stats' && <StatsScreen save={save} onBack={() => setScreen('home')} />}
      {screen === 'shop' && <ShopScreen save={save} onBack={() => setScreen('home')} onBuy={buyHint} />}
      {screen === 'settings' && <SettingsScreen save={save} onBack={() => setScreen('home')} onToggle={toggleSetting} onReset={resetProgress} />}
      {screen === 'game' && <GameScreen level={level} round={round} seconds={seconds} feedback={feedback} hintWords={hintWords} hintLabel={hintLabel} inventory={save.inventory} onWord={handleWord} onHint={useHint} onBack={() => setScreen('map')} onShop={() => setScreen('shop')} />}
      {screen === 'victory' && victory && <VictoryScreen victory={victory} save={save} onContinue={() => victory.levelId < TOTAL_LEVELS ? startLevel(victory.levelId + 1) : setScreen('map')} onMap={() => setScreen('map')} />}
    </main>
    {!['game', 'victory'].includes(screen) && <nav className="bottom-nav" aria-label="Navigation principale">
      <NavButton icon="⌂" label="Accueil" active={screen === 'home'} onClick={() => setScreen('home')} />
      <NavButton icon="▦" label="Parcours" active={screen === 'map'} onClick={() => setScreen('map')} />
      <NavButton icon="◈" label="Boutique" active={screen === 'shop'} onClick={() => setScreen('shop')} />
      <NavButton icon="★" label="Stats" active={screen === 'stats'} onClick={() => setScreen('stats')} />
      <NavButton icon="⚙" label="Réglages" active={screen === 'settings'} onClick={() => setScreen('settings')} />
    </nav>}
  </div>;
}

function NavButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}><span>{icon}</span>{label}</button>;
}

function HomeScreen({ save, progress, onPlay, onMap, onDaily, onStats }: { save: PlayerSave; progress: number; onPlay: () => void; onMap: () => void; onDaily: () => void; onStats: () => void }) {
  const next = Math.min(TOTAL_LEVELS, save.currentLevel);
  return <section className="home-screen">
    <div className="hero-card"><div className="hero-copy"><p className="eyebrow">TON PROCHAIN DÉFI</p><h1>Les mots se<br /><em>mettent en place.</em></h1><p className="hero-subtitle">Regroupe 24 mots en 6 familles. Chaque association révèle la suivante.</p><button className="primary-button" onClick={onPlay}>Jouer le niveau {next} <span>→</span></button></div><div className="hero-art" aria-hidden="true"><div className="cascade-orb orb-a">✦</div><div className="cascade-orb orb-b">A</div><div className="cascade-orb orb-c">B</div><div className="cascade-orb orb-d">C</div><div className="cascade-orb orb-e">D</div><div className="orbit-line" /></div></div>
    <div className="home-grid"><button className="feature-card daily-card" onClick={onDaily}><span className="feature-icon">☼</span><span><b>Rituel quotidien</b><small>{save.lastDailyClaim === new Date().toISOString().slice(0, 10) ? 'Récompense récupérée' : '+35 pièces disponibles'}</small></span><strong>→</strong></button><button className="feature-card" onClick={onMap}><span className="feature-icon purple">⌁</span><span><b>Parcours des 500</b><small>{save.completedLevels.length} niveaux terminés · {progress}%</small></span><strong>→</strong></button><button className="feature-card" onClick={onStats}><span className="feature-icon orange">★</span><span><b>Ta série</b><small>{save.streak} victoire{save.streak > 1 ? 's' : ''} consécutive{save.streak > 1 ? 's' : ''}</small></span><strong>→</strong></button></div>
    <div className="section-heading"><h2>Continuer l'ascension</h2><span>{save.completedLevels.length}/{TOTAL_LEVELS}</span></div><div className="progress-track"><span style={{ width: `${Math.max(2, progress)}%` }} /></div><p className="progress-caption">Niveau {next} · {progress}% du voyage parcouru</p>
  </section>;
}

function MapScreen({ save, onBack, onStart }: { save: PlayerSave; onBack: () => void; onStart: (id: number) => void }) {
  const chapters = Array.from({ length: 25 }, (_, index) => index + 1);
  return <section className="page-screen"><PageTitle eyebrow="PARCOURS" title="La grande ascension" subtitle="25 chapitres · 500 niveaux · une difficulté qui grandit avec toi" onBack={onBack} /><div className="map-grid">{chapters.map((chapter) => { const first = (chapter - 1) * 20 + 1; const last = chapter * 20; const done = save.completedLevels.filter((id) => id >= first && id <= last).length; const unlocked = first <= save.currentLevel; return <article className={`chapter-card ${unlocked ? '' : 'locked'}`} key={chapter}><div className="chapter-number">{unlocked ? String(chapter).padStart(2, '0') : '⌑'}</div><div><b>Chapitre {chapter}</b><small>{done}/20 niveaux</small><div className="mini-track"><span style={{ width: `${done * 5}%` }} /></div></div><button disabled={!unlocked} onClick={() => onStart(Math.max(first, Math.min(save.currentLevel, last)))}>{unlocked ? 'Ouvrir' : 'Verrouillé'}</button></article>; })}</div></section>;
}

function DailyScreen({ save, claimed, onClaim, onBack }: { save: PlayerSave; claimed: boolean; onClaim: () => void; onBack: () => void }) {
  return <section className="page-screen centered-page"><PageTitle eyebrow="CHAQUE JOUR" title="Le mot du jour" subtitle="Une petite marche, une belle récompense." onBack={onBack} /><div className="daily-reward-card"><div className="sun-badge">☼</div><h2>Rendez-vous quotidien</h2><p>Reviens chaque jour pour recevoir des pièces et entretenir ta série.</p><div className="reward-amount">+35 <span>◈ pièces</span></div><button className="primary-button" disabled={claimed} onClick={onClaim}>{claimed ? 'Récompense récupérée' : 'Récupérer ma récompense'}</button><small>Dernière visite : {save.lastDailyClaim ? new Date(save.lastDailyClaim).toLocaleDateString('fr-FR') : 'jamais'}</small></div></section>;
}

function StatsScreen({ save, onBack }: { save: PlayerSave; onBack: () => void }) {
  const results = Object.values(save.results); const avg = results.length ? Math.round(results.reduce((sum, result) => sum + result.bestTimeSeconds, 0) / results.length) : 0; const perfect = results.filter((result) => result.bestErrors === 0 && result.bestHints === 0).length;
  return <section className="page-screen"><PageTitle eyebrow="TON HISTORIQUE" title="Les traces de ton parcours" subtitle="Chaque partie compte, chaque série te ressemble." onBack={onBack} /><div className="stats-grid"><Stat value={String(save.completedLevels.length)} label="niveaux terminés" accent="green" /><Stat value={formatTime(avg)} label="temps moyen" accent="purple" /><Stat value={String(save.bestStreak)} label="meilleure série" accent="orange" /><Stat value={String(perfect)} label="parties parfaites" accent="blue" /></div><div className="achievement-panel"><div className="section-heading"><h2>Badges en vue</h2><span>{save.unlockedAchievements.length}/6</span></div><div className="badges"><Badge icon="✦" title="Premier pas" unlocked={save.completedLevels.length >= 1} /><Badge icon="✹" title="Dix marches" unlocked={save.completedLevels.length >= 10} /><Badge icon="◆" title="Sans faute" unlocked={perfect >= 1} /><Badge icon="∞" title="Belle série" unlocked={save.bestStreak >= 7} /><Badge icon="✦" title="Cent niveaux" unlocked={save.completedLevels.length >= 100} /><Badge icon="♛" title="Sommet" unlocked={save.completedLevels.length >= 500} /></div></div></section>;
}

function Stat({ value, label, accent }: { value: string; label: string; accent: string }) { return <div className={`stat-card ${accent}`}><b>{value}</b><small>{label}</small></div>; }
function Badge({ icon, title, unlocked }: { icon: string; title: string; unlocked: boolean }) { return <div className={`badge ${unlocked ? 'unlocked' : ''}`}><span>{unlocked ? icon : '·'}</span><small>{title}</small></div>; }

function ShopScreen({ save, onBack, onBuy }: { save: PlayerSave; onBack: () => void; onBuy: (kind: HintKind) => void }) {
  const items: Array<{ kind: HintKind; icon: string; title: string; text: string }> = [{ kind: 'pair', icon: '◒', title: 'Duo lumineux', text: 'Surligne deux mots d’une même famille.' }, { kind: 'label', icon: 'Aa', title: 'Étiquette', text: 'Révèle le thème d’une famille.' }, { kind: 'solve', icon: '✦', title: 'Coup de pouce', text: 'Résout une famille instantanément.' }];
  return <section className="page-screen"><PageTitle eyebrow="ATELIER" title="La boutique des idées" subtitle="Des aides claires, une économie sans hasard." onBack={onBack} /><div className="shop-wallet"><span>Ton solde</span><b>◈ {save.coins}</b></div><div className="shop-grid">{items.map((item) => <article className="shop-card" key={item.kind}><div className="shop-icon">{item.icon}</div><h3>{item.title}</h3><p>{item.text}</p><div className="shop-bottom"><span>En stock : {save.inventory[item.kind]}</span><button onClick={() => onBuy(item.kind)} disabled={save.coins < HINT_COSTS[item.kind]}>◈ {HINT_COSTS[item.kind]}</button></div></article>)}</div><p className="economy-note">Les pièces se gagnent en jouant : précision, rapidité, séries et paliers récompensent la régularité.</p></section>;
}

function SettingsScreen({ save, onBack, onToggle, onReset }: { save: PlayerSave; onBack: () => void; onToggle: (key: keyof PlayerSave['settings']) => void; onReset: () => void }) {
  return <section className="page-screen narrow-page"><PageTitle eyebrow="PRÉFÉRENCES" title="Un jeu à ton rythme" subtitle="Tout est sauvegardé sur cet appareil, même sans réseau." onBack={onBack} /><div className="settings-list"><Setting label="Sons" description="Retours sonores discrets" value={save.settings.sound} onClick={() => onToggle('sound')} /><Setting label="Vibrations" description="Un retour tactile à chaque association" value={save.settings.haptics} onClick={() => onToggle('haptics')} /><Setting label="Mouvement réduit" description="Limite les animations de transition" value={save.settings.reducedMotion} onClick={() => onToggle('reducedMotion')} /></div><div className="offline-note"><span>⌁</span><div><b>Mode hors-ligne activé</b><p>Le corpus, ta progression et tes pièces restent disponibles sans connexion.</p></div></div><button className="danger-button" onClick={onReset}>Réinitialiser la progression</button></section>;
}
function Setting({ label, description, value, onClick }: { label: string; description: string; value: boolean; onClick: () => void }) { return <button className="setting-row" onClick={onClick}><span><b>{label}</b><small>{description}</small></span><span className={`switch ${value ? 'on' : ''}`}><i /></span></button>; }

function GameScreen({ level, round, seconds, feedback, hintWords, hintLabel, inventory, onWord, onHint, onBack, onShop }: { level: ReturnType<typeof import('./game/data').getLevel> extends infer T ? Exclude<T, undefined> : never; round: RoundState; seconds: number; feedback: Feedback; hintWords: string[]; hintLabel: string | null; inventory: PlayerSave['inventory']; onWord: (word: string) => void; onHint: (kind: HintKind) => void; onBack: () => void; onShop: () => void }) {
  const solved = new Set(round.solvedFamilyIds);
  const selected = new Set(round.selected);
  return <section className="game-screen"><div className="game-head"><button className="icon-button" onClick={onBack} aria-label="Retour">←</button><div><span className="eyebrow">CHAPITRE {level.chapter}</span><h1>Niveau {level.id}</h1></div><div className="game-metrics"><span>⏱ {formatTime(seconds)}</span><span>× {round.errors}</span></div></div><div className="game-progress"><span style={{ width: `${(round.solvedFamilyIds.length / 6) * 100}%` }} /></div><div className="game-instruction"><p>Trouve les six familles</p><span>{round.solvedFamilyIds.length}/6 · {difficultyLabel(level.difficulty)} · objectif {formatTime(targetSeconds(level))}</span></div>{hintLabel && <div className="hint-label">Indice : <b>{hintLabel}</b></div>}<div className="words-grid">{level.words.map((word) => { const isHint = hintWords.includes(word); const isSelected = selected.has(word); const isSolved = [...solved].some((familyId) => level.families.find((family) => family.id === familyId)?.words.includes(word)); const feedbackWord = feedback?.words.includes(word); return <button key={word} className={`word-tile ${isSelected ? 'selected' : ''} ${isHint ? 'hinted' : ''} ${isSolved ? 'solved' : ''} ${feedbackWord && feedback?.kind === 'wrong' ? 'wrong' : ''}`} onClick={() => onWord(word)} disabled={isSolved}>{word}</button>; })}</div>{feedback?.kind === 'correct' && <div className="toast success-toast">✓ {feedback.label ?? 'Famille trouvée'}</div>}{feedback?.kind === 'wrong' && <div className="toast error-toast">Pas tout à fait · essaie une autre combinaison</div>}<div className="hint-bar"><button onClick={() => onHint('pair')} disabled={inventory.pair <= 0}>◒ Duo <small>({inventory.pair})</small></button><button onClick={() => onHint('label')} disabled={inventory.label <= 0}>Aa Étiquette <small>({inventory.label})</small></button><button onClick={() => onHint('solve')} disabled={inventory.solve <= 0}>✦ Résoudre <small>({inventory.solve})</small></button><button className="shop-link" onClick={onShop}>◈ Boutique</button></div></section>;
}

function VictoryScreen({ victory, save, onContinue, onMap }: { victory: { reward: RewardBreakdown; elapsed: number; errors: number; hints: number; levelId: number }; save: PlayerSave; onContinue: () => void; onMap: () => void }) {
  const next = Math.min(TOTAL_LEVELS, victory.levelId + 1); const reward = victory.reward;
  return <section className="victory-screen"><div className="confetti" aria-hidden="true">✦　✧　✦　✧　✦</div><p className="eyebrow">NIVEAU {victory.levelId} TERMINÉ</p><h1>La cascade<br /><em>continue.</em></h1><p className="victory-copy">Six familles trouvées. Le prochain palier t’attend déjà.</p><div className="victory-stats"><div><span>Temps</span><b>{formatTime(victory.elapsed)}</b></div><div><span>Erreurs</span><b>{victory.errors}</b></div><div><span>Aides</span><b>{victory.hints}</b></div></div><div className="reward-card"><span>Récompense de la partie</span><b>+{reward.total} <small>◈ pièces</small></b><div className="reward-breakdown"><span>Base +{reward.base}</span><span>Difficulté +{reward.difficulty}</span><span>Précision +{reward.precision}</span><span>Série +{reward.streak}</span>{reward.milestone > 0 && <span>Palier +{reward.milestone}</span>}</div></div><p className="level-up">Progression : <b>{victory.levelId}</b> → <b>{next}</b> <span>· {save.coins} pièces au total</span></p><div className="victory-actions"><button className="primary-button" onClick={onContinue}>{victory.levelId === TOTAL_LEVELS ? 'Revoir le parcours' : `Niveau ${next}`} <span>→</span></button><button className="secondary-button" onClick={onMap}>Voir le parcours</button></div></section>;
}

function PageTitle({ eyebrow, title, subtitle, onBack }: { eyebrow: string; title: string; subtitle: string; onBack: () => void }) { return <div className="page-title"><button className="icon-button" onClick={onBack} aria-label="Retour">←</button><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div></div>; }

export default App;
