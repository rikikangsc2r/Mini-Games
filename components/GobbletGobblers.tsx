import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Player } from '../types';
import BackButton from './BackButton';
import useSounds from './useSounds';

// --- Global Declarations & Helpers ---
declare const firebase: any;
const db = firebase.database();

const getDeviceId = (): string => {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('deviceId', id);
  }
  return id;
};

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

// --- Type Definitions ---
type PieceSize = 0 | 1 | 2;
interface Piece {
  player: Player;
  size: PieceSize;
}
type BoardCell = Piece[];
type BoardState = BoardCell[][];
type HomePiles = Record<Player, Piece[][]>;
interface Selection {
  piece: Piece;
  from: 'home' | { r: number; c: number };
  homePileIndex?: number;
}
type GameMode = 'menu' | 'local' | 'online';
type OnlineStep = 'name' | 'room' | 'game';

interface OnlinePlayer {
  deviceId: string;
  name: string;
}

interface OnlineGameState {
  board: BoardState;
  homePiles: HomePiles;
  currentPlayer: Player;
  winner: Player | null;
  winningLine: number[][];
  players: {
    X: OnlinePlayer | null;
    O: OnlinePlayer | null;
  };
  createdAt: any;
  rematch: { X: boolean; O: boolean };
  startingPlayer: Player;
}

// --- Helper Functions ---
const createInitialPiles = (): HomePiles => {
  const createPlayerPiles = (player: Player): Piece[][] =>
    [0, 1, 2].map(size => [
      { player, size: size as PieceSize },
      { player, size: size as PieceSize },
    ]);
  return {
    X: createPlayerPiles('X'),
    O: createPlayerPiles('O'),
  };
};

const createInitialBoard = (): BoardState =>
  Array(3).fill(null).map(() => Array(3).fill(null).map(() => []));

const GobbletGobblers: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  // --- State ---
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [onlineStep, setOnlineStep] = useState<OnlineStep>('name');
  const [selection, setSelection] = useState<Selection | null>(null);
  const playSound = useSounds();
  
  // Local state
  const [board, setBoard] = useState<BoardState>(createInitialBoard);
  const [homePiles, setHomePiles] = useState<HomePiles>(createInitialPiles);
  const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
  const [winner, setWinner] = useState<Player | null>(null);
  const [winningLine, setWinningLine] = useState<number[][]>([]);
  
  // Online state
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [playerSymbol, setPlayerSymbol] = useState<Player | null>(null);
  const [onlineGameState, setOnlineGameState] = useState<OnlineGameState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);
  const roomInputRef = useRef<HTMLInputElement>(null);
  const deviceId = useRef<string>(getDeviceId());
  const prevOnlineGameState = usePrevious(onlineGameState);

  // --- Initial Setup ---
  useEffect(() => {
    const storedName = localStorage.getItem('playerName');
    if (storedName) {
      setPlayerName(storedName);
      setOnlineStep('room');
    }
  }, []);

  // --- Game Logic ---
  const checkWinner = useCallback((currentBoard: BoardState): { winner: Player; line: number[][] } | null => {
    const lines = [
      [[0, 0], [0, 1], [0, 2]], [[1, 0], [1, 1], [1, 2]], [[2, 0], [2, 1], [2, 2]],
      [[0, 0], [1, 0], [2, 0]], [[0, 1], [1, 1], [2, 1]], [[0, 2], [1, 2], [2, 2]],
      [[0, 0], [1, 1], [2, 2]], [[0, 2], [1, 1], [2, 0]],
    ];
    for (const line of lines) {
      const piecesInLine = line.map(([r, c]) => {
        const cell = currentBoard[r][c];
        return cell.length > 0 ? cell[cell.length - 1] : null;
      });
      if (piecesInLine.every(p => p !== null) &&
          piecesInLine[0]?.player === piecesInLine[1]?.player &&
          piecesInLine[1]?.player === piecesInLine[2]?.player) {
        return { winner: piecesInLine[0]!.player, line };
      }
    }
    return null;
  }, []);
  
  const resetLocalGame = useCallback(() => {
    playSound('select');
    setBoard(createInitialBoard());
    setHomePiles(createInitialPiles());
    setCurrentPlayer('X');
    setWinner(null);
    setWinningLine([]);
    setSelection(null);
  }, [playSound]);
  
  // --- Handlers ---
  const handleHomePieceClick = (player: Player, homePileIndex: number) => {
    const isOnline = gameMode === 'online';
    const gs = isOnline ? onlineGameState : { winner, currentPlayer, homePiles };
    const currentTurnPlayer = isOnline ? playerSymbol : player;

    if (gs?.winner || gs?.currentPlayer !== currentTurnPlayer) return;

    const pile = gs.homePiles[player][homePileIndex];
    if (pile.length === 0) return;

    const pieceToSelect = pile[pile.length - 1];
    
    if (selection?.from === 'home' && selection.homePileIndex === homePileIndex) {
      setSelection(null);
    } else {
      playSound('select');
      setSelection({
        piece: pieceToSelect,
        from: 'home',
        homePileIndex,
      });
    }
  };

  const handleBoardCellClick = (r: number, c: number) => {
    const isOnline = gameMode === 'online';
    const currentTurnPlayer = isOnline ? playerSymbol : currentPlayer;

    if ((isOnline && !onlineGameState) || (isOnline ? onlineGameState.winner : winner)) return;

    if (selection) { // --- Placement click ---
      const targetBoard = isOnline ? onlineGameState!.board : board;
      const targetCell = targetBoard[r][c];
      const topPieceOnTarget = targetCell.length > 0 ? targetCell[targetCell.length - 1] : null;

      if (topPieceOnTarget && selection.piece.size <= topPieceOnTarget.size) {
        playSound('back');
        setSelection(null);
        return;
      }
      
      playSound('place');
      
      const newBoard = JSON.parse(JSON.stringify(targetBoard));
      const newHomePiles = JSON.parse(JSON.stringify(isOnline ? onlineGameState!.homePiles : homePiles));
      
      newBoard[r][c].push(selection.piece);
      if (selection.from === 'home') {
        newHomePiles[currentTurnPlayer!][selection.homePileIndex!].pop();
      } else {
        newBoard[selection.from.r][selection.from.c].pop();
      }
      
      const result = checkWinner(newBoard);
      const nextPlayer = currentTurnPlayer === 'X' ? 'O' : 'X';

      if (isOnline) {
        const updates: Partial<Pick<OnlineGameState, 'board' | 'homePiles' | 'currentPlayer' | 'winner' | 'winningLine'>> = {
            board: newBoard,
            homePiles: newHomePiles,
            currentPlayer: nextPlayer
        };
        if (result) {
            updates.winner = result.winner;
            updates.winningLine = result.line;
        }
        db.ref(`gobblet-games/${roomId}`).update(updates);
      } else {
        setBoard(newBoard);
        setHomePiles(newHomePiles);
        if (result) {
          playSound('win');
          setWinner(result.winner);
          setWinningLine(result.line);
        } else {
          setCurrentPlayer(nextPlayer);
        }
      }
      setSelection(null);

    } else { // --- Selection click from board ---
      const sourceBoard = isOnline ? onlineGameState!.board : board;
      const cell = sourceBoard[r][c];
      if (cell.length === 0 || cell[cell.length - 1].player !== currentTurnPlayer) return;

      playSound('select');
      setSelection({
        piece: cell[cell.length - 1],
        from: { r, c },
      });
    }
  };

  // --- Online Logic ---
  const handleNameSubmit = () => {
    const name = nameInputRef.current?.value.trim();
    if (name) {
      playSound('select');
      setPlayerName(name);
      localStorage.setItem('playerName', name);
      setOnlineStep('room');
    } else {
      setError('Nama tidak boleh kosong.');
    }
  };

  const handleEnterRoom = useCallback(async () => {
    const enteredRoomId = roomInputRef.current?.value.trim().toUpperCase();
    if (!enteredRoomId) {
      setError('Nama room tidak boleh kosong.');
      return;
    }
    playSound('select');
    setIsLoading(true);
    setError('');
    
    const roomRef = db.ref(`gobblet-games/${enteredRoomId}`);
    try {
      const snapshot = await roomRef.get();
      const gameData: OnlineGameState | null = snapshot.val();
      const isExpired = gameData && (Date.now() - gameData.createdAt > 3600 * 1000);

      if (!snapshot.exists() || isExpired) {
        const newGame: OnlineGameState = {
          board: createInitialBoard(),
          homePiles: createInitialPiles(),
          currentPlayer: 'X',
          winner: null,
          winningLine: [],
          players: { X: { deviceId: deviceId.current, name: playerName }, O: null },
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          rematch: { X: false, O: false },
          startingPlayer: 'X',
        };
        await roomRef.set(newGame);
        setRoomId(enteredRoomId);
        setPlayerSymbol('X');
        localStorage.setItem('gobblet_roomId', enteredRoomId);
        setOnlineStep('game');
      } else {
        if (gameData.players.X?.deviceId === deviceId.current) {
          setRoomId(enteredRoomId);
          setPlayerSymbol('X');
          setOnlineStep('game');
        } else if (gameData.players.O?.deviceId === deviceId.current) {
          setRoomId(enteredRoomId);
          setPlayerSymbol('O');
          setOnlineStep('game');
        } else if (!gameData.players.O) {
          await roomRef.child('players/O').set({ deviceId: deviceId.current, name: playerName });
          setRoomId(enteredRoomId);
          setPlayerSymbol('O');
          localStorage.setItem('gobblet_roomId', enteredRoomId);
          setOnlineStep('game');
        } else {
          setError('Room sudah penuh.');
        }
      }
    } catch (e) {
      setError('Gagal masuk room. Coba lagi.');
    } finally {
      setIsLoading(false);
    }
  }, [playerName, playSound]);

  const handleBack = () => {
    setError('');
    if (gameMode !== 'online') {
      onBack();
    } else {
      playSound('back');
      if (onlineStep === 'game' || onlineStep === 'room') {
        localStorage.removeItem('gobblet_roomId');
        setRoomId('');
        setPlayerSymbol(null);
        setOnlineGameState(null);
        if (onlineStep === 'room') setGameMode('menu');
        else setOnlineStep('room');
      } else if (onlineStep === 'name') {
        setGameMode('menu');
      }
    }
  };
  
  useEffect(() => {
    if (onlineStep !== 'game' || !roomId) return;
    
    const roomRef = db.ref(`gobblet-games/${roomId}`);
    const listener = roomRef.on('value', (snapshot: any) => {
      if (snapshot.exists()) {
        const gameData = snapshot.val();
        
        // Robustly reconstruct board state from Firebase data, which may represent arrays as objects.
        const reconstructedBoard = createInitialBoard();
        const boardData = gameData.board;
        if (boardData && typeof boardData === 'object') {
            Object.keys(boardData).forEach(r_key => {
                const r = parseInt(r_key, 10);
                if (isNaN(r) || r < 0 || r >= 3) return;
                const rowData = boardData[r_key];
                if (rowData && typeof rowData === 'object') {
                    Object.keys(rowData).forEach(c_key => {
                        const c = parseInt(c_key, 10);
                        if (isNaN(c) || c < 0 || c >= 3) return;
                        const cellData = rowData[c_key];
                        // A cell is a stack of pieces, which can be an array or an object from Firebase
                        if (cellData && typeof cellData === 'object') {
                            reconstructedBoard[r][c] = Object.values(cellData);
                        } else if (Array.isArray(cellData)) {
                            reconstructedBoard[r][c] = cellData;
                        }
                    });
                }
            });
        }
        
        // Robustly reconstruct home piles state
        const reconstructedPiles = createInitialPiles();
        ['X', 'O'].forEach(p_key => {
            const player = p_key as Player;
            const playerPilesData = gameData.homePiles?.[player];
            if (playerPilesData && typeof playerPilesData === 'object') {
                Object.keys(playerPilesData).forEach(pileIndex_key => {
                    const pileIndex = parseInt(pileIndex_key, 10);
                    if (isNaN(pileIndex) || pileIndex < 0 || pileIndex >= 3) return;
                    const pileData = playerPilesData[pileIndex_key];
                    // A pile is a stack of pieces, which can be an array or an object from Firebase
                    if (pileData && typeof pileData === 'object') {
                        reconstructedPiles[player][pileIndex] = Object.values(pileData);
                    } else if (Array.isArray(pileData)) {
                        reconstructedPiles[player][pileIndex] = pileData;
                    } else {
                        reconstructedPiles[player][pileIndex] = [];
                    }
                });
            }
        });

        const sanitizedGameData: OnlineGameState = {
          ...gameData,
          board: reconstructedBoard,
          homePiles: reconstructedPiles,
          winningLine: gameData.winningLine || [],
          players: gameData.players || { X: null, O: null },
          rematch: gameData.rematch || { X: false, O: false },
        };
        setOnlineGameState(sanitizedGameData);

        if (sanitizedGameData.rematch.X && sanitizedGameData.rematch.O) {
          const newStartingPlayer = sanitizedGameData.startingPlayer === 'X' ? 'O' : 'X';
          roomRef.update({
            board: createInitialBoard(),
            homePiles: createInitialPiles(),
            currentPlayer: newStartingPlayer,
            winner: null,
            winningLine: [],
            rematch: { X: false, O: false },
            startingPlayer: newStartingPlayer
          });
        }
      } else {
        setError('Room tidak ada lagi.');
        handleBack();
      }
    });
    return () => roomRef.off('value', listener);
  }, [roomId, onlineStep, handleBack]);
  
  useEffect(() => {
    if (onlineStep === 'game' && onlineGameState && prevOnlineGameState) {
      if (!prevOnlineGameState.players.O && onlineGameState.players.O) playSound('notify');
      if (!prevOnlineGameState.winner && onlineGameState.winner) {
        playSound(onlineGameState.winner === playerSymbol ? 'win' : 'draw');
      }
    }
  }, [onlineGameState, prevOnlineGameState, onlineStep, playerSymbol, playSound]);

  const handleRematch = () => {
    if (!roomId || !playerSymbol) return;
    playSound('select');
    db.ref(`gobblet-games/${roomId}/rematch/${playerSymbol}`).set(true);
  };
  
  // --- Render Functions ---
  const getStatusMessage = () => {
    if (gameMode === 'local') {
      if (winner) return `Pemain ${winner} Menang!`;
      return `Giliran Pemain ${currentPlayer}`;
    }
    if (onlineStep === 'game' && onlineGameState) {
      const { winner, currentPlayer, players } = onlineGameState;
      const opponentName = playerSymbol === 'X' ? players.O?.name : players.X?.name;
      if (winner) return winner === playerSymbol ? "Kamu Menang!" : `${opponentName || 'Lawan'} Menang!`;
      return currentPlayer === playerSymbol ? "Giliranmu" : `Menunggu ${opponentName || 'Lawan'}`;
    }
    return '';
  };

  const PieceComponent: React.FC<{ piece: Piece, isTop: boolean, isSelected?: boolean }> = ({ piece, isTop, isSelected }) => {
    const sizeMap = ['40%', '70%', '100%'];
    const colorMap = { X: '#0dcaf0', O: '#ffc107' };
    return (
      <div
        className="position-absolute top-50 start-50 rounded-circle d-flex justify-content-center align-items-center"
        style={{
          width: sizeMap[piece.size], height: sizeMap[piece.size],
          transform: 'translate(-50%, -50%)', backgroundColor: colorMap[piece.player],
          border: `3px solid ${isTop ? '#f8f9fa' : '#495057'}`,
          boxShadow: isSelected ? `0 0 15px 5px ${colorMap[piece.player]}` : (isTop ? '0 2px 8px rgba(0,0,0,0.5)' : 'none'),
          transition: 'all 0.2s ease-in-out', zIndex: piece.size + (isSelected ? 10 : 0),
          cursor: isTop && !(winner || onlineGameState?.winner) ? 'pointer' : 'default',
        }}
      ><div className="rounded-circle" style={{ width: '60%', height: '60%', border: `3px solid rgba(0,0,0,0.2)` }} /></div>
    );
  };
  
  const HomePileComponent: React.FC<{ player: Player }> = ({ player }) => {
    const isOnline = gameMode === 'online';
    const gs = isOnline ? onlineGameState : { currentPlayer, winner };
    const piles = isOnline ? onlineGameState?.homePiles[player] : homePiles[player];
    const isPlayerTurn = gs?.currentPlayer === player && !gs?.winner;
    const canInteract = isOnline ? (isPlayerTurn && player === playerSymbol) : isPlayerTurn;
    
    return (
      <div className={`d-flex justify-content-center gap-3 p-3 bg-secondary rounded-3 shadow ${isPlayerTurn ? 'border border-3 border-info' : ''}`} style={{ transition: 'border 0.3s ease' }}>
        {piles?.map((pile, pileIndex) => {
          const isSelected = selection?.from === 'home' && selection.homePileIndex === pileIndex && selection.piece.player === player;
          const topPiece = pile.length > 0 ? pile[pile.length - 1] : null;
          return (
            <div
              key={pileIndex}
              className="rounded-3 position-relative"
              style={{ width: '80px', height: '80px', backgroundColor: '#343a40', cursor: topPiece && canInteract ? 'pointer' : 'default'}}
              onClick={() => canInteract && handleHomePieceClick(player, pileIndex)}
            >
              {pile.map((piece, i) => (
                 <PieceComponent key={i} piece={piece} isTop={i === pile.length - 1} isSelected={isSelected && i === pile.length - 1} />
              ))}
            </div>
          );
        })}
      </div>
    );
  };
  
  const renderGameBoard = (boardToRender: BoardState, winningLineToRender: number[][]) => (
     <div className="d-grid shadow-lg rounded-3 p-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', width: 'clamp(280px, 90vw, 400px)', aspectRatio: '1 / 1', backgroundColor: '#1a1d20' }}>
      {boardToRender.flat().map((cell, i) => {
        const r = Math.floor(i / 3); const c = i % 3;
        const isSelected = selection?.from !== 'home' && selection?.from.r === r && selection?.from.c === c;
        const isWinningCell = winningLineToRender.some(([wr, wc]) => wr === r && wc === c);
        return (
          <div key={i} className="rounded position-relative" style={{ backgroundColor: '#212529', cursor: (winner || onlineGameState?.winner) ? 'default' : 'pointer', transition: 'all 0.3s', border: isWinningCell ? '3px solid #198754' : 'none', boxShadow: isWinningCell ? '0 0 15px #198754' : 'none' }} onClick={() => handleBoardCellClick(r, c)}>
            {cell.map((piece, pieceIndex) => <PieceComponent key={`${piece.player}-${piece.size}-${pieceIndex}`} piece={piece} isTop={pieceIndex === cell.length - 1} isSelected={isSelected} />)}
          </div>
        );
      })}
    </div>
  );

  const renderOnlineContent = () => {
    switch (onlineStep) {
      case 'name':
        return <div className="text-center col-md-8 col-lg-6 mx-auto"><h2 className="display-5 fw-bold text-white mb-4">Masukkan Namamu</h2><div className="input-group"><input ref={nameInputRef} type="text" className="form-control form-control-lg bg-secondary border-secondary text-light" placeholder="Nama Pemain" /><button onClick={handleNameSubmit} className="btn btn-info">Lanjut</button></div>{error && <p className="text-danger mt-2">{error}</p>}</div>;
      case 'room':
        return <div className="text-center col-md-8 col-lg-6 mx-auto"><h2 className="display-5 fw-bold text-white mb-3">Selamat Datang, {playerName}!</h2><p className="fs-5 text-muted mb-4">Masukkan nama room untuk bermain.</p><div className="input-group"><input ref={roomInputRef} type="text" className="form-control form-control-lg bg-secondary border-secondary text-light" placeholder="Nama Room" /><button onClick={handleEnterRoom} disabled={isLoading} className="btn btn-info">{isLoading ? <span className="spinner-border spinner-border-sm"></span> : 'Masuk'}</button></div>{error && <p className="text-danger mt-2">{error}</p>}</div>;
      case 'game':
        if (!onlineGameState) return <div className="text-center"><div className="spinner-border text-info"></div><p className="mt-3">Memuat game...</p></div>;
        if (!onlineGameState.players.O) {
          return <div className="text-center"><h2 className="display-5 fw-bold text-white mb-3">Room: {roomId}</h2><p className="fs-5 text-muted">Bagikan nama room ini ke temanmu</p><div className="my-4 d-flex justify-content-center align-items-center gap-2"><div className="spinner-border text-warning" role="status"></div><p className="fs-4 text-warning m-0">Menunggu pemain lain...</p></div></div>;
        }
        const rematchCount = (onlineGameState.rematch.X ? 1 : 0) + (onlineGameState.rematch.O ? 1 : 0);
        const amIReadyForRematch = playerSymbol && onlineGameState.rematch[playerSymbol];
        return (
          <div className="d-flex flex-column align-items-center gap-4">
            <div className="text-center">
              <p className="text-muted mb-0">Room: {roomId}</p>
              <p className={`mt-2 fs-4 fw-semibold ${onlineGameState.winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p>
            </div>
            <HomePileComponent player="O" />
            {renderGameBoard(onlineGameState.board, onlineGameState.winningLine)}
            <HomePileComponent player="X" />
            {onlineGameState.winner && <button onClick={handleRematch} disabled={!!amIReadyForRematch} className="mt-3 btn btn-primary btn-lg">Rematch ({rematchCount}/2)</button>}
          </div>
        );
    }
  };
  
  const renderContent = () => {
    switch(gameMode) {
      case 'menu':
        return <div className="text-center"><h2 className="display-5 fw-bold text-white mb-5">Gobblet Gobblers</h2><div className="d-grid gap-3 col-sm-8 col-md-6 col-lg-4 mx-auto"><button onClick={() => { playSound('select'); setGameMode('local'); }} className="btn btn-primary btn-lg">Mabar Lokal</button><button onClick={() => { playSound('select'); setGameMode('online'); }} className="btn btn-info btn-lg">Mabar Online</button></div></div>;
      case 'local':
        return (
          <div className="d-flex flex-column align-items-center gap-4">
            <div className="text-center"><p className={`mt-2 fs-4 fw-semibold ${winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p></div>
            <HomePileComponent player="O" />
            {renderGameBoard(board, winningLine)}
            <HomePileComponent player="X" />
            {winner && <button onClick={resetLocalGame} className="mt-3 btn btn-primary btn-lg">Main Lagi</button>}
          </div>
        );
      case 'online':
        return renderOnlineContent();
    }
  };

  return (
    <div className="d-flex flex-column align-items-center justify-content-center position-relative" style={{ minHeight: '80vh' }}>
      <BackButton onClick={gameMode === 'menu' ? onBack : handleBack} />
       <div className="text-center mb-4">
         {gameMode !== 'menu' && <h2 className="display-5 fw-bold text-white">Gobblet Gobblers</h2>}
       </div>
      {renderContent()}
    </div>
  );
};

export default GobbletGobblers;
