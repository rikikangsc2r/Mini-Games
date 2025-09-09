import React, { useState, useEffect, useCallback, useRef } from 'react';
import BackButton from './BackButton';
import useSounds from './useSounds';
import type { Player } from '../types';
import { useOnlineGame, BaseOnlineGameState, OnlinePlayer } from '../hooks/useOnlineGame';
import OnlineGameSetup from './OnlineGameSetup';
import GameLobby from './GameLobby';
import OnlineGameWrapper from './OnlineGameWrapper';
import PlayerDisplay from './PlayerDisplay';

declare const firebase: any;
const db = firebase.database();

const API_URL = 'https://cdn.jsdelivr.net/gh/rikikangsc2-eng/metadata@main/caklontong.json';
const MIN_WORDS = 8;
const MAX_WORDS = 12;
const MAX_GRID_SIZE = 25;
const MAX_GENERATION_ATTEMPTS = 50;
const GENERATION_TIMEOUT_MS = 20000;
const MAX_CHANCES = 3;

const LOADING_MESSAGES = [
    "Sedang merangkai kata-kata aneh...",
    "Mencari persilangan yang mustahil...",
    "Meminta inspirasi dari Cak Lontong...",
    "Mengacak huruf hingga pusing...",
    "Menyesuaikan tingkat kesulitan 'mustahil'..."
];

// --- TYPE DEFINITIONS ---
interface CakLontongQuestion {
  soal: string;
  jawaban: string;
  deskripsi: string;
}
interface WordToPlace { word: string; clue: string; description: string; }
interface PlacedWord { word: string; clue: string; description: string; direction: 'across' | 'down'; row: number; col: number; number: number; }
type SoloCellStatus = 'empty' | 'correct' | 'revealed';
interface SoloGameState { [uniqueKey: string]: { status: SoloCellStatus; attempts: number; }; }
interface Puzzle { grid: (PlacedWord | null)[][]; words: PlacedWord[]; clues: { across: PlacedWord[], down: PlacedWord[] }; width: number; height: number; rowOffset: number; colOffset: number; }
interface CrosswordProps { onBackToMenu: () => void; }

interface OnlineGameState extends BaseOnlineGameState {
    puzzle: Puzzle | null;
    gameState: { [key: string]: { status: 'correct'; solvedBy: Player; }; };
    scores: { X: number; O: number; };
    chances: { X: number; O: number; };
    players: { X: OnlinePlayer | null; O: OnlinePlayer | null; };
}

// --- HELPER FUNCTIONS ---
const performSingleGenerationAttempt = (allQuestions: CakLontongQuestion[]): Puzzle | null => {
    const numWords = Math.floor(Math.random() * (MAX_WORDS - MIN_WORDS + 1)) + MIN_WORDS;
    const shuffledQuestions = [...allQuestions].sort(() => 0.5 - Math.random());
    let availableWords: WordToPlace[] = shuffledQuestions.map(q => ({
      word: q.jawaban.toUpperCase().replace(/[^A-Z\s]/g, '').replace(/\s/g, ''),
      clue: q.soal,
      description: q.deskripsi,
    })).filter(w => w.word.length > 2 && w.word.length < 15);

    const grid: (string | null)[][] = Array(MAX_GRID_SIZE).fill(null).map(() => Array(MAX_GRID_SIZE).fill(null));
    const placedWords: Omit<PlacedWord, 'number'>[] = [];
    
    const firstWord = availableWords.shift();
    if (!firstWord) return null;
    
    const startRow = Math.floor(MAX_GRID_SIZE / 2);
    const startCol = Math.floor((MAX_GRID_SIZE - firstWord.word.length) / 2);
    for (let i = 0; i < firstWord.word.length; i++) { grid[startRow][startCol + i] = firstWord.word[i]; }
    placedWords.push({ ...firstWord, direction: 'across', row: startRow, col: startCol });
    
    while(placedWords.length < numWords && availableWords.length > 0) {
        let wordPlaced = false;
        for(let i = 0; i < availableWords.length; i++) {
            const wordToPlace = availableWords[i];
            let bestPlacement = null;
            for (const placed of placedWords) {
                const newDirection = placed.direction === 'across' ? 'down' : 'across';
                for (let j = 0; j < wordToPlace.word.length; j++) {
                    const matchIndex = placed.word.indexOf(wordToPlace.word[j]);
                    if (matchIndex === -1) continue;
                    let r, c;
                    if (newDirection === 'down') { r = placed.row - j; c = placed.col + matchIndex; } else { r = placed.row + matchIndex; c = placed.col - j; }
                    if (r < 1 || c < 1 || (newDirection === 'down' && r + wordToPlace.word.length >= MAX_GRID_SIZE-1) || (newDirection === 'across' && c + wordToPlace.word.length >= MAX_GRID_SIZE-1)) continue;
                    let isValid = true;
                    if (newDirection === 'down') { if ((grid[r - 1] && grid[r - 1][c] !== null) || (grid[r + wordToPlace.word.length] && grid[r + wordToPlace.word.length][c] !== null)) isValid = false; } else { if ((grid[r][c - 1] !== null) || (grid[r][c + wordToPlace.word.length] !== null)) isValid = false; }
                    if (!isValid) continue;
                    for (let k = 0; k < wordToPlace.word.length; k++) {
                        if (k === j) continue;
                        const checkR = newDirection === 'down' ? r + k : r;
                        const checkC = newDirection === 'across' ? c + k : c;
                        if (grid[checkR][checkC] !== null) { isValid = false; break; }
                        if (newDirection === 'down') { if (grid[checkR][checkC - 1] !== null || grid[checkR][checkC + 1] !== null) { isValid = false; break; } } else { if (grid[checkR - 1][checkC] !== null || grid[checkR + 1][checkC] !== null) { isValid = false; break; } }
                    }
                    if (isValid) { bestPlacement = { ...wordToPlace, direction: newDirection, row: r, col: c }; break; }
                }
                if (bestPlacement) break;
            }
            if(bestPlacement) {
                for (let k = 0; k < bestPlacement.word.length; k++) { if (bestPlacement.direction === 'down') grid[bestPlacement.row + k][bestPlacement.col] = bestPlacement.word[k]; else grid[bestPlacement.row][bestPlacement.col + k] = bestPlacement.word[k]; }
                placedWords.push(bestPlacement);
                availableWords.splice(i, 1);
                wordPlaced = true;
                break; 
            }
        }
        if(!wordPlaced) break;
    }

    if (placedWords.length >= MIN_WORDS) {
        let minR = MAX_GRID_SIZE, maxR = -1, minC = MAX_GRID_SIZE, maxC = -1;
        placedWords.forEach(w => {
            minR = Math.min(minR, w.row); minC = Math.min(minC, w.col);
            if (w.direction === 'across') { maxR = Math.max(maxR, w.row); maxC = Math.max(maxC, w.col + w.word.length - 1); } else { maxR = Math.max(maxR, w.row + w.word.length - 1); maxC = Math.max(maxC, w.col); }
        });
        const numberedWords: PlacedWord[] = [];
        let clueNumber = 1;
        const starts = new Map<string, number>();
        placedWords.sort((a,b) => a.row - b.row || a.col - b.col).forEach(word => {
            const key = `${word.row},${word.col}`;
            if(!starts.has(key)) starts.set(key, clueNumber++);
            numberedWords.push({...word, number: starts.get(key)!});
        });
        return {
            grid: [], words: numberedWords, width: maxC - minC + 1, height: maxR - minR + 1,
            rowOffset: minR, colOffset: minC,
            clues: { across: numberedWords.filter(w => w.direction === 'across').sort((a,b) => a.number - b.number), down: numberedWords.filter(w => w.direction === 'down').sort((a,b) => a.number - b.number) }
        };
    }
    return null;
};
const generatePuzzleAsync = (allQuestions: CakLontongQuestion[], signal: AbortSignal): Promise<Puzzle | null> => {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const tryGenerate = () => {
            if (signal.aborted) return reject(new DOMException('Generation aborted', 'AbortError'));
            if (attempts >= MAX_GENERATION_ATTEMPTS) return resolve(null);
            const result = performSingleGenerationAttempt(allQuestions);
            if (result) return resolve(result);
            attempts++;
            setTimeout(tryGenerate, 0); 
        };
        tryGenerate();
    });
};

const createInitialOnlineState = (playerName: string, deviceId: string, avatarUrl: string): OnlineGameState => ({
    puzzle: null, gameState: {}, scores: { X: 0, O: 0 }, chances: { X: MAX_CHANCES, O: MAX_CHANCES }, currentPlayer: 'X', winner: null,
    players: { X: { deviceId, name: playerName, avatarUrl }, O: null },
    createdAt: firebase.database.ServerValue.TIMESTAMP, rematch: { X: false, O: false },
    startingPlayer: 'X', chatMessages: [],
});
const getRematchState = (): Partial<OnlineGameState> => ({ puzzle: null, gameState: {}, scores: { X: 0, O: 0 }, chances: { X: MAX_CHANCES, O: MAX_CHANCES }, chatMessages: [] });
const reconstructOnlineState = (gameData: any): OnlineGameState => ({
    ...gameData, puzzle: gameData.puzzle || null, gameState: gameData.gameState || {}, scores: gameData.scores || { X: 0, O: 0 }, chances: gameData.chances || { X: MAX_CHANCES, O: MAX_CHANCES },
    players: gameData.players || { X: null, O: null }, rematch: gameData.rematch || { X: false, O: false }, chatMessages: gameData.chatMessages || [],
});
const OnlinePlayerBar: React.FC<{ player: OnlinePlayer | null; score: number; chances: number; isMyTurn: boolean; }> = ({ player, score, chances, isMyTurn }) => (
    <div className={`d-flex align-items-center justify-content-between w-100 p-2 rounded ${isMyTurn ? 'bg-success bg-opacity-25' : ''}`} style={{maxWidth: '500px', transition: 'background-color 0.3s ease'}}>
        <PlayerDisplay player={player} />
        <div className="d-flex align-items-center gap-3">
            <span className="text-danger fw-bold">Peluang: {chances}</span>
            <span className="fw-bold fs-4 text-info">{score}</span>
        </div>
    </div>
);

// --- MAIN COMPONENT ---
const Crossword: React.FC<CrosswordProps> = ({ onBackToMenu }) => {
  const [gameMode, setInternalGameMode] = useState<'menu' | 'solo' | 'online'>('menu');
  const {
      gameMode: onlineHookMode, onlineStep, playerProfile, roomId, playerSymbol, onlineGameState,
      isLoading: isOnlineLoading, error: onlineError, roomInputRef, handleProfileSubmit,
      handleEnterRoom, handleRematch, changeGameMode: setOnlineHookMode, handleChangeProfileRequest, sendChatMessage,
  } = useOnlineGame('crossword-games', createInitialOnlineState, reconstructOnlineState, getRematchState, onBackToMenu);

  // Solo Game State
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<CakLontongQuestion[]>([]);
  const [puzzleData, setPuzzleData] = useState<Puzzle | null>(null);
  const [nextPuzzleData, setNextPuzzleData] = useState<Puzzle | null>(null);
  const [soloGameState, setSoloGameState] = useState<SoloGameState>({});
  const [activeClue, setActiveClue] = useState<PlacedWord | null>(null);
  const [currentGuess, setCurrentGuess] = useState('');
  const [revealedInfo, setRevealedInfo] = useState<{ clue: PlacedWord, description: string } | null>(null);

  const playSound = useSounds();
  const generationController = useRef<AbortController | null>(null);
  const guessInputRef = useRef<HTMLInputElement>(null);
  
  const changeGameMode = (mode: 'menu' | 'solo' | 'online') => {
      playSound('select');
      setInternalGameMode(mode);
      if (mode === 'online') {
          setOnlineHookMode('online');
      } else {
          setOnlineHookMode('menu'); // Reset online hook state if not in online mode
      }
  };

  const generateAndSetPuzzle = useCallback(async (isInitial: boolean) => {
      if (questions.length === 0) return;
      if (generationController.current) generationController.current.abort();
      generationController.current = new AbortController();
      const signal = generationController.current.signal;
      if(isInitial) setLoading(true);

      const timeoutId = setTimeout(() => {
          generationController.current?.abort();
          if (isInitial) { setError("Gagal membuat puzzle (waktu habis). Coba muat ulang halaman."); setLoading(false); }
      }, GENERATION_TIMEOUT_MS);
      try {
          const puzzle = await generatePuzzleAsync(questions, signal);
          clearTimeout(timeoutId);
          if (signal.aborted) return;
          if (puzzle) {
              if (isInitial) {
                  setPuzzleData(puzzle);
                  const initialGameState: SoloGameState = {};
                  puzzle.words.forEach(w => { initialGameState[`${w.number}-${w.direction}`] = { status: 'empty', attempts: 0 }; });
                  setSoloGameState(initialGameState);
                  setLoading(false);
                  generateAndSetPuzzle(false); // Pre-generate next puzzle
              } else {
                  setNextPuzzleData(puzzle);
              }
          } else if (isInitial) { setError("Gagal membuat puzzle setelah beberapa kali mencoba. Coba muat ulang."); setLoading(false); }
      } catch (err) {
          if ((err as Error).name !== 'AbortError' && isInitial) { setError("Terjadi kesalahan saat membuat puzzle."); setLoading(false); }
      }
  }, [questions]);
  
  useEffect(() => { fetch(API_URL).then(res => res.json()).then(setQuestions).catch(() => { setError("Gagal memuat pertanyaan. Coba lagi nanti."); setLoading(false); }); }, []);
  useEffect(() => { if (loading) { const interval = setInterval(() => { setLoadingMessage(prev => LOADING_MESSAGES[(LOADING_MESSAGES.indexOf(prev) + 1) % LOADING_MESSAGES.length]); }, 2000); return () => clearInterval(interval); } }, [loading]);
  useEffect(() => { if (activeClue) { setTimeout(() => guessInputRef.current?.focus(), 100); } }, [activeClue]);

  // Online: Generate puzzle for host
  useEffect(() => {
    if (gameMode === 'online' && onlineGameState?.players.O && !onlineGameState.puzzle && playerSymbol === 'X' && questions.length > 0) {
        const generateAndUpload = async () => {
            let puzzle: Puzzle | null = null;
            for (let i = 0; i < MAX_GENERATION_ATTEMPTS; i++) {
                puzzle = performSingleGenerationAttempt(questions);
                if (puzzle) break;
            }
            if (puzzle) db.ref(`crossword-games/${roomId}/puzzle`).set(puzzle);
            else console.error("Gagal membuat puzzle untuk game online.");
        };
        generateAndUpload();
    }
  }, [onlineGameState, playerSymbol, gameMode, roomId, questions]);

  const handleNewPuzzleRequest = useCallback(() => {
    playSound('select'); setLoading(true); setPuzzleData(null); setError(null);
    const setupPuzzle = (puzzle: Puzzle) => {
        setPuzzleData(puzzle);
        const initialGameState: SoloGameState = {};
        puzzle.words.forEach(w => { initialGameState[`${w.number}-${w.direction}`] = { status: 'empty', attempts: 0 }; });
        setSoloGameState(initialGameState); setLoading(false);
    }
    if (nextPuzzleData) { setupPuzzle(nextPuzzleData); setNextPuzzleData(null); generateAndSetPuzzle(false); } 
    else { generateAndSetPuzzle(true); }
  }, [nextPuzzleData, playSound, generateAndSetPuzzle]);

  const handleRevealAnswerSolo = useCallback((clue: PlacedWord, isGiveUp: boolean) => {
    const key = `${clue.number}-${clue.direction}`;
    setSoloGameState(prev => ({ ...prev, [key]: { ...prev[key], status: isGiveUp ? 'revealed' : 'correct' }}));
    setRevealedInfo({ clue, description: clue.description });
    setActiveClue(null); setCurrentGuess('');
    playSound(isGiveUp ? 'back' : 'win');
  }, [playSound]);

  const handleCheckGuessSolo = useCallback(() => {
    if (!activeClue) return;
    const guess = currentGuess.toUpperCase().replace(/\s/g, '');
    const answer = activeClue.word.toUpperCase().replace(/\s/g, '');
    const key = `${activeClue.number}-${activeClue.direction}`;
    if (guess === answer) {
        handleRevealAnswerSolo(activeClue, false);
    } else {
        playSound('back');
        const currentAttempts = soloGameState[key].attempts;
        setSoloGameState(prev => ({ ...prev, [key]: { ...prev[key], attempts: currentAttempts + 1 }}));
        if (currentAttempts + 1 >= 3) handleRevealAnswerSolo(activeClue, true);
        else { alert(`Jawaban salah! Sisa percobaan: ${2 - currentAttempts}`); setCurrentGuess(''); }
    }
  }, [activeClue, currentGuess, soloGameState, handleRevealAnswerSolo, playSound]);
  
  const handleCheckGuessOnline = useCallback(() => {
    if (!activeClue || !onlineGameState || !playerSymbol || !onlineGameState.puzzle || onlineGameState.winner) return;

    if (onlineGameState.currentPlayer !== playerSymbol || onlineGameState.chances[playerSymbol] <= 0) {
        playSound('back');
        return;
    }
    
    const key = `${activeClue.number}-${activeClue.direction}`;
    if (onlineGameState.gameState[key]) return;
      
    const guess = currentGuess.toUpperCase().replace(/\s/g, '');
    const answer = activeClue.word.toUpperCase().replace(/\s/g, '');
    
    const updates: any = {};
    let isGameOver = false;

    if (guess === answer) {
        playSound('win');
        updates[`gameState/${key}`] = { status: 'correct', solvedBy: playerSymbol };
        updates[`scores/${playerSymbol}`] = firebase.database.ServerValue.increment(10);
        
        const newGameState = { ...onlineGameState.gameState, [key]: { status: 'correct', solvedBy: playerSymbol } };
        const allSolved = onlineGameState.puzzle.words.every(w => newGameState[`${w.number}-${w.direction}`]?.status === 'correct');
        if (allSolved) isGameOver = true;

    } else { // Incorrect guess
        playSound('back');
        const newChances = onlineGameState.chances[playerSymbol] - 1;
        updates[`chances/${playerSymbol}`] = newChances;
        updates.currentPlayer = playerSymbol === 'X' ? 'O' : 'X';

        const opponentSymbol = playerSymbol === 'X' ? 'O' : 'X';
        if (newChances <= 0 && onlineGameState.chances[opponentSymbol] <= 0) {
            isGameOver = true;
        }
    }
    
    if (isGameOver) {
        const currentScores = onlineGameState.scores;
        const myFinalScore = (guess === answer) ? currentScores[playerSymbol] + 10 : currentScores[playerSymbol];
        const opponentScore = currentScores[playerSymbol === 'X' ? 'O' : 'X'];

        if (myFinalScore > opponentScore) updates.winner = playerSymbol;
        else if (opponentScore > myFinalScore) updates.winner = playerSymbol === 'X' ? 'O' : 'X';
        else updates.winner = 'Draw';
    }

    db.ref(`crossword-games/${roomId}`).update(updates);
    setActiveClue(null);
    setCurrentGuess('');
}, [activeClue, currentGuess, onlineGameState, playerSymbol, roomId, playSound]);


  const renderGrid = (puzzle: Puzzle, currentGameState: SoloGameState | OnlineGameState['gameState']) => {
    const { width, height, rowOffset, colOffset, words } = puzzle;
    const gridCells: {char: string, num: number | null, status: SoloCellStatus | Player | 'empty-online'}[][] = Array(height).fill(null).map(() => Array(width).fill(null).map(() => ({ char: '', num: null, status: 'empty' })));
    const filledCells = new Set<string>();
    words.forEach(word => {
        const key = `${word.number}-${word.direction}`;
        const wordState = currentGameState[key] as { status: SoloCellStatus } | { status: 'correct', solvedBy: Player } | undefined;
        for (let i = 0; i < word.word.length; i++) {
            const r = word.row - rowOffset + (word.direction === 'down' ? i : 0);
            const c = word.col - colOffset + (word.direction === 'across' ? i : 0);
            if (r < 0 || r >= height || c < 0 || c >= width) continue;
            if (i === 0) gridCells[r][c].num = word.number;
            const cellKey = `${r},${c}`;
            if (wordState?.status === 'correct' || wordState?.status === 'revealed') {
                gridCells[r][c].char = word.word[i];
                gridCells[r][c].status = 'solvedBy' in wordState ? wordState.solvedBy : wordState.status;
            } else if (gameMode === 'online') {
                gridCells[r][c].status = 'empty-online';
            }
            filledCells.add(cellKey);
        }
    });
    return (
        <div className="crossword-grid-wrapper shadow" style={{ aspectRatio: width / height }}>
            <div className="crossword-grid" style={{ gridTemplateColumns: `repeat(${width}, 1fr)`, gridTemplateRows: `repeat(${height}, 1fr)` }}>
                {Array.from({ length: height * width }).map((_, i) => {
                    const r = Math.floor(i / width); const c = i % width;
                    if (!filledCells.has(`${r},${c}`)) return <div key={i} className="crossword-cell blocked"></div>;
                    const cell = gridCells[r][c];
                    let cellClass = 'crossword-cell';
                    if (cell.status === 'revealed') cellClass += ' revealed';
                    else if (cell.status === 'X') cellClass += ' bg-info bg-opacity-25';
                    else if (cell.status === 'O') cellClass += ' bg-warning bg-opacity-25';
                    return ( <div key={i} className={cellClass}> {cell.num && <span className="cell-number">{cell.num}</span>} {cell.char} </div> );
                })}
            </div>
        </div>
    );
  };
    
  const renderClues = (puzzle: Puzzle, currentGameState: SoloGameState | OnlineGameState['gameState'], onClueClick: (clue: PlacedWord) => void) => (
    <div className="crossword-clues shadow">
        {['across', 'down'].map(dir => (
            <div key={dir} className="clue-list mt-3">
                <h5 className="text-info">{dir === 'across' ? 'Mendatar' : 'Menurun'}</h5>
                <ul className="list-unstyled">
                    {puzzle.clues[dir as 'across' | 'down'].map(clue => {
                        const key = `${clue.number}-${clue.direction}`;
                        const state = currentGameState[key] as { status: SoloCellStatus } | { status: 'correct', solvedBy: Player } | undefined;
                        let className = `clue-item text-light`;
                        let style: React.CSSProperties = {};
                        if (state?.status === 'correct' || state?.status === 'revealed') {
                            className += ' text-decoration-line-through text-muted';
                             if ('solvedBy' in state) {
                                style.backgroundColor = state.solvedBy === 'X' ? 'rgba(13, 202, 240, 0.2)' : 'rgba(255, 193, 7, 0.2)';
                            }
                        }
                        return ( <li key={key} className={className} style={style} onClick={() => !(state?.status === 'correct' || state?.status === 'revealed') && onClueClick(clue)}> <strong>{clue.number}.</strong> {clue.clue} </li>);
                    })}
                </ul>
            </div>
        ))}
    </div>
  );

  const renderModals = () => {
    const handleGuess = gameMode === 'online' ? handleCheckGuessOnline : handleCheckGuessSolo;
    const activeClueKey = activeClue ? `${activeClue.number}-${activeClue.direction}` : null;
    const attemptsLeft = activeClueKey ? 3 - (soloGameState[activeClueKey]?.attempts || 0) : 3;
    const isOnline = gameMode === 'online';
    const isMyTurnOnline = isOnline && onlineGameState?.currentPlayer === playerSymbol && !onlineGameState.winner;
    const canGuessOnline = isMyTurnOnline && onlineGameState && playerSymbol ? onlineGameState.chances[playerSymbol] > 0 : false;

    
    return (
    <>
      {activeClue && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: 'block' }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content bg-secondary text-light">
                <div className="modal-header border-secondary-subtle">
                  <h5 className="modal-title text-info">{activeClue.number}. {activeClue.direction === 'across' ? 'Mendatar' : 'Menurun'}</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setActiveClue(null)}></button>
                </div>
                <div className="modal-body">
                  <p>{activeClue.clue}</p>
                  <input ref={guessInputRef} type="text" className="form-control bg-dark border-secondary text-light" value={currentGuess} onChange={(e) => setCurrentGuess(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleGuess()}/>
                  {!isOnline && <p className="text-muted small mt-2">Sisa percobaan: {attemptsLeft}</p>}
                </div>
                <div className="modal-footer border-secondary-subtle">
                  {!isOnline && <button type="button" className="btn btn-outline-warning" onClick={() => handleRevealAnswerSolo(activeClue, true)}>Nyerah</button>}
                  <button type="button" className="btn btn-primary" onClick={handleGuess} disabled={isOnline && !canGuessOnline}>Cek Jawaban</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {revealedInfo && !isOnline && (
         <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: 'block' }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content bg-secondary text-light">
                <div className="modal-header border-secondary-subtle">
                  <h5 className="modal-title text-info">Jawaban</h5> <button type="button" className="btn-close btn-close-white" onClick={() => setRevealedInfo(null)}></button>
                </div>
                <div className="modal-body">
                  <p className="mb-2">Jawabannya adalah: <strong className="fs-5 text-warning">{revealedInfo.clue.word}</strong></p> <p className="fst-italic">"{revealedInfo.description}"</p>
                </div>
                 <div className="modal-footer border-secondary-subtle"> <button type="button" className="btn btn-info" onClick={() => setRevealedInfo(null)}>Mengerti</button> </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
  }
  
  const renderSoloContent = () => {
    if (!puzzleData && questions.length > 0 && !error && !loading) {
        generateAndSetPuzzle(true);
    }
    if (loading) return <div className="text-center"><div className="spinner-border text-info" role="status"></div><p className="mt-2">{loadingMessage}</p></div>;
    if (error) return <div className="alert alert-danger">{error}</div>;
    if (!puzzleData) return null;
    return (
        <>
            <div className="crossword-container">
                {renderGrid(puzzleData, soloGameState)}
                {renderClues(puzzleData, soloGameState, (clue) => setActiveClue(clue))}
            </div>
            <div className="text-center mt-4 d-flex flex-wrap justify-content-center gap-2">
                <button className="btn btn-primary" onClick={handleNewPuzzleRequest} disabled={!nextPuzzleData && loading}>
                    {nextPuzzleData || !loading ? 'Puzzle Baru' : <span className="spinner-border spinner-border-sm"></span>}
                </button>
            </div>
            {renderModals()}
        </>
    )
  };

  const renderOnlineContent = () => {
    if (onlineStep !== 'game') return <OnlineGameSetup {...{ onlineStep, playerProfile, roomInputRef, handleProfileSubmit, handleEnterRoom, isLoading: isOnlineLoading, error: onlineError, handleChangeProfileRequest }} />;
    if (!onlineGameState) return <div className="text-center"><div className="spinner-border text-info"></div><p className="mt-3">Memuat game...</p></div>;
    if (!onlineGameState.players.O) return <GameLobby roomId={roomId} />;
    
    const mySymbol = playerSymbol!;
    const opponentSymbol = mySymbol === 'X' ? 'O' : 'X';
    
    const getStatusMessage = () => {
        const { winner, currentPlayer, players, scores, chances } = onlineGameState;
        const winnerName = winner && winner !== 'Draw' ? players[winner]?.name : null;
        if (winner) {
            if (winnerName) return `Pemenang: ${winnerName}!`;
            return `Permainan berakhir! Skor Akhir: ${players.X?.name} ${scores.X} - ${players.O?.name} ${scores.O}`;
        }
        if (chances[mySymbol] <= 0 && chances[opponentSymbol] <= 0) return 'Kesempatan habis untuk kedua pemain!';
        if (chances[mySymbol] <= 0) return `Kesempatanmu habis! Menunggu ${players[opponentSymbol]?.name}...`;
        if (currentPlayer === mySymbol) return "Giliranmu untuk menjawab!";
        return `Menunggu giliran ${players[currentPlayer]?.name}...`;
    };

    const isMyTurn = onlineGameState.currentPlayer === playerSymbol && !onlineGameState.winner;
    const canIGuess = isMyTurn && onlineGameState.chances[mySymbol] > 0;

    return (
        <OnlineGameWrapper
            myPlayer={onlineGameState.players[mySymbol]} opponent={onlineGameState.players[opponentSymbol]} mySymbol={mySymbol} roomId={roomId}
            statusMessage={getStatusMessage()}
            isMyTurn={isMyTurn} isGameOver={!!onlineGameState.winner}
            rematchCount={(onlineGameState.rematch.X ? 1 : 0) + (onlineGameState.rematch.O ? 1 : 0)}
            amIReadyForRematch={!!(playerSymbol && onlineGameState.rematch[playerSymbol])} onRematch={handleRematch}
            chatMessages={onlineGameState.chatMessages} onSendMessage={sendChatMessage}
            opponentSideContent={<OnlinePlayerBar player={onlineGameState.players[opponentSymbol]} score={onlineGameState.scores[opponentSymbol]} chances={onlineGameState.chances[opponentSymbol]} isMyTurn={!isMyTurn && !onlineGameState.winner} />}
            mySideContent={<OnlinePlayerBar player={onlineGameState.players[mySymbol]} score={onlineGameState.scores[mySymbol]} chances={onlineGameState.chances[mySymbol]} isMyTurn={isMyTurn} />}
        >
            {onlineGameState.puzzle ? (
                <>
                    <div className="crossword-container">
                        {renderGrid(onlineGameState.puzzle, onlineGameState.gameState)}
                        {renderClues(onlineGameState.puzzle, onlineGameState.gameState, (clue) => !onlineGameState.winner && canIGuess && setActiveClue(clue))}
                    </div>
                    {renderModals()}
                </>
            ) : (
                <div className="text-center p-5">
                    <div className="spinner-border text-info"></div>
                    <p className="mt-3 text-light">{playerSymbol === 'X' ? 'Membuat puzzle...' : 'Menunggu host membuat puzzle...'}</p>
                </div>
            )}
        </OnlineGameWrapper>
    );
  };

  const renderContent = () => {
    switch(gameMode) {
      case 'menu': return (
          <div className="text-center">
            <h2 className="display-5 fw-bold text-white mb-3">Teka Teki Lontong</h2>
            <p className="fs-5 text-muted col-md-10 col-lg-8 mx-auto mb-5">Teka-teki silang dengan jawaban nyeleneh dan tak terduga. Uji logika humorismu!</p>
            <div className="d-grid gap-3 col-sm-8 col-md-6 col-lg-4 mx-auto">
                <button onClick={() => changeGameMode('solo')} className="btn btn-primary btn-lg">Main Solo</button>
                <button onClick={() => changeGameMode('online')} className="btn btn-info btn-lg">Main Online</button>
            </div>
        </div>
      );
      case 'online': return renderOnlineContent();
      case 'solo': return renderSoloContent();
    }
  };
    
  return (
    <div className="d-flex flex-column align-items-center justify-content-center position-relative pb-4" style={{ minHeight: '80vh' }}>
        <BackButton onClick={gameMode === 'menu' ? onBackToMenu : () => changeGameMode('menu')} />
        <div className="text-center mb-4">
             {gameMode !== 'menu' && <h2 className="display-5 fw-bold text-white mb-0">Teka Teki Lontong</h2>}
        </div>
        {renderContent()}
    </div>
  );
};

export default Crossword;