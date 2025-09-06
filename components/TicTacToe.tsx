import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Player } from '../types';
import BackButton from './BackButton';

// Objek firebase global dari skrip di index.html
declare const firebase: any;

const Square: React.FC<{ value: Player | null; onClick: () => void; isWinning: boolean; disabled?: boolean }> = ({ value, onClick, isWinning, disabled }) => (
  <button
    className={`btn d-flex align-items-center justify-content-center fw-bold rounded-3 transition-all duration-200
      ${isWinning ? 'btn-success text-white scale-110' : 'btn-dark'}
      ${value === 'X' ? 'text-info' : 'text-warning'}`}
    onClick={onClick}
    disabled={disabled}
    aria-label={`Kotak ${value ? `dengan nilai ${value}` : 'kosong'}`}
    style={{
        width: 'clamp(70px, 20vw, 100px)',
        height: 'clamp(70px, 20vw, 100px)',
        fontSize: 'clamp(2rem, 10vw, 3.5rem)'
    }}
  >
    {value}
  </button>
);

type GameMode = 'menu' | 'local' | 'online-menu' | 'online-lobby' | 'online-game';

interface OnlineGameState {
    board: (Player | null)[];
    currentPlayer: Player;
    winner: Player | 'Draw' | null;
    winningLine: number[];
    players: { X: boolean; O: boolean; };
}

const TicTacToe: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  
  // State game online
  const [roomId, setRoomId] = useState('');
  const [playerSymbol, setPlayerSymbol] = useState<Player | null>(null);
  const [onlineGameState, setOnlineGameState] = useState<OnlineGameState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const joinRoomInputRef = useRef<HTMLInputElement>(null);

  // State game lokal
  const [board, setBoard] = useState<(Player | null)[]>(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
  const [winner, setWinner] = useState<Player | 'Draw' | null>(null);
  const [winningLine, setWinningLine] = useState<number[]>([]);

  const db = firebase.database();

  const calculateWinner = useCallback((squares: (Player | null)[]): { winner: Player | 'Draw', line: number[] } | null => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return { winner: squares[a] as Player, line: lines[i] };
      }
    }
    if (squares.every(square => square !== null)) {
        return { winner: 'Draw', line: [] };
    }
    return null;
  }, []);
  
  // Logika game lokal
  useEffect(() => {
    if (gameMode === 'local') {
      const result = calculateWinner(board);
      if (result) {
        setWinner(result.winner);
        setWinningLine(result.line);
      }
    }
  }, [board, gameMode, calculateWinner]);

  const handleLocalClick = (index: number) => {
    if (winner || board[index]) return;
    const newBoard = [...board];
    newBoard[index] = currentPlayer;
    setBoard(newBoard);
    setCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X');
  };

  const resetLocalGame = () => {
    setBoard(Array(9).fill(null));
    setCurrentPlayer('X');
    setWinner(null);
    setWinningLine([]);
  };

  // Logika game online
  const handleCreateRoom = useCallback(async () => {
    setIsLoading(true);
    setError('');
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const newGame: OnlineGameState = {
        board: Array(9).fill(null),
        currentPlayer: 'X',
        winner: null,
        winningLine: [],
        players: { X: true, O: false },
    };
    try {
        await db.ref(`games/${newRoomId}`).set(newGame);
        setRoomId(newRoomId);
        setPlayerSymbol('X');
        setGameMode('online-lobby');
    } catch (e) {
        setError('Gagal membuat room. Coba lagi.');
        console.error(e);
    } finally {
        setIsLoading(false);
    }
  }, [db]);

  const handleJoinRoom = useCallback(async () => {
      setIsLoading(true);
      setError('');
      const joinRoomId = joinRoomInputRef.current?.value.toUpperCase().trim();
      if (!joinRoomId) {
          setError('Masukkan ID room.');
          setIsLoading(false);
          return;
      }
      const roomRef = db.ref(`games/${joinRoomId}`);
      try {
          const snapshot = await roomRef.get();
          if (snapshot.exists()) {
              const gameData: OnlineGameState = snapshot.val();
              if (gameData.players.O) {
                  setError('Room sudah penuh.');
              } else {
                  await roomRef.child('players/O').set(true);
                  setRoomId(joinRoomId);
                  setPlayerSymbol('O');
              }
          } else {
              setError('Room tidak ditemukan.');
          }
      } catch (e) {
          setError('Gagal bergabung ke room. Coba lagi.');
          console.error(e);
      } finally {
          setIsLoading(false);
      }
  }, [db]);

  useEffect(() => {
    if (!roomId || !db) return;
    const roomRef = db.ref(`games/${roomId}`);
    const listener = roomRef.on('value', (snapshot: any) => {
        if (snapshot.exists()) {
            const gameData = snapshot.val();
            // Sanitize Firebase data: ensure board and winningLine are always arrays to prevent runtime errors.
            const sanitizedGameData: OnlineGameState = {
                ...gameData,
                board: gameData.board || Array(9).fill(null),
                winningLine: gameData.winningLine || [],
            };
            setOnlineGameState(sanitizedGameData);
            if (gameMode === 'online-lobby' && gameData.players?.O) {
                setGameMode('online-game');
            }
        } else {
            setError('Room tidak ada lagi. Kembali ke menu.');
            setGameMode('online-menu');
            setRoomId('');
        }
    });
    return () => roomRef.off('value', listener);
  }, [roomId, db, gameMode]);

  const handleOnlineClick = (index: number) => {
    if (!onlineGameState || onlineGameState.winner || onlineGameState.board[index] || onlineGameState.currentPlayer !== playerSymbol) {
        return;
    }
    const newBoard = [...onlineGameState.board];
    newBoard[index] = onlineGameState.currentPlayer;
    const result = calculateWinner(newBoard);
    const nextPlayer = onlineGameState.currentPlayer === 'X' ? 'O' : 'X';
    
    const updates: Partial<OnlineGameState> = { board: newBoard, currentPlayer: nextPlayer };
    if (result) {
        updates.winner = result.winner;
        updates.winningLine = result.line;
    }
    db.ref(`games/${roomId}`).update(updates);
  };

  const resetOnlineGame = () => {
      if (!roomId || !db) return;
      db.ref(`games/${roomId}`).update({
          board: Array(9).fill(null),
          currentPlayer: 'X',
          winner: null,
          winningLine: [],
      });
  }

  const handleBack = () => {
      setError('');
      if (gameMode === 'local' || gameMode === 'menu') {
          onBack();
      } else if (gameMode === 'online-lobby' || gameMode === 'online-game') {
          setGameMode('online-menu');
          setRoomId('');
          setPlayerSymbol(null);
          setOnlineGameState(null);
      } else if (gameMode === 'online-menu') {
          setGameMode('menu');
      }
  };
  
  const getStatusMessage = () => {
    if (gameMode === 'local') {
        if (winner) return winner === 'Draw' ? "Hasilnya Seri!" : `Pemain ${winner} Menang!`;
        return `Giliran Pemain ${currentPlayer}`;
    }
    if (gameMode === 'online-game' && onlineGameState) {
        const { winner: onlineWinner, currentPlayer: onlineCurrentPlayer } = onlineGameState;
        if (onlineWinner) {
            if (onlineWinner === 'Draw') return "Hasilnya Seri!";
            return onlineWinner === playerSymbol ? "Kamu Menang!" : "Kamu Kalah!";
        }
        return onlineCurrentPlayer === playerSymbol ? "Giliranmu" : "Menunggu Lawan";
    }
    return '';
  };

  const renderGameBoard = (
      boardState: (Player | null)[], 
      winningLineState: number[], 
      handleClick: (index: number) => void,
      isGameActive: boolean
  ) => (
      <div className="p-3 rounded-3 shadow-lg" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', backgroundColor: '#000' }}>
        {boardState.map((value, index) => (
          <Square 
            key={index} 
            value={value} 
            onClick={() => handleClick(index)} 
            isWinning={winningLineState.includes(index)}
            disabled={!isGameActive}
          />
        ))}
      </div>
  );

  const renderContent = () => {
    switch(gameMode) {
      case 'menu':
        return (
          <div className="text-center">
            <h2 className="display-5 fw-bold text-white mb-5">Tic-Tac-Toe</h2>
            <div className="d-grid gap-3 col-sm-8 col-md-6 col-lg-4 mx-auto">
              <button onClick={() => setGameMode('local')} className="btn btn-primary btn-lg">Mabar Lokal</button>
              <button onClick={() => setGameMode('online-menu')} className="btn btn-info btn-lg">Mabar Online</button>
            </div>
          </div>
        );
      case 'local':
        return (
          <div className="text-center">
            <div className="mb-5">
                <h2 className="display-5 fw-bold text-white">Tic-Tac-Toe Lokal</h2>
                <p className={`mt-4 fs-4 fw-semibold ${winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p>
            </div>
            {renderGameBoard(board, winningLine, handleLocalClick, !winner)}
            {winner && <button onClick={resetLocalGame} className="mt-5 btn btn-primary btn-lg">Main Lagi</button>}
          </div>
        );
      case 'online-menu':
        return (
            <div className="text-center col-md-8 col-lg-6 mx-auto">
                <h2 className="display-5 fw-bold text-white mb-5">Mabar Online</h2>
                <div className="d-grid gap-3">
                    <button onClick={handleCreateRoom} disabled={isLoading} className="btn btn-primary btn-lg">
                        {isLoading ? 'Membuat...' : 'Buat Room Baru'}
                    </button>
                </div>
                <div className="my-4 text-muted position-relative d-flex align-items-center justify-content-center">
                    <hr className="w-100" />
                    <span className="position-absolute px-3 bg-dark">ATAU</span>
                </div>
                <div>
                    <label htmlFor="joinRoomInput" className="form-label">Gabung Room yang Ada</label>
                    <div className="input-group">
                        <input ref={joinRoomInputRef} type="text" id="joinRoomInput" className="form-control form-control-lg bg-secondary border-secondary text-light" placeholder="Masukkan ID Room" aria-label="ID Room" />
                        <button onClick={handleJoinRoom} disabled={isLoading} className="btn btn-info">
                            {isLoading ? '...' : 'Gabung'}
                        </button>
                    </div>
                    {error && <p className="text-danger mt-2">{error}</p>}
                </div>
            </div>
        );
      case 'online-lobby':
        return (
          <div className="text-center">
            <h2 className="display-5 fw-bold text-white mb-3">Lobby</h2>
            <p className="fs-5 text-muted">Bagikan ID Room ini ke temanmu</p>
            <div className="my-4 d-flex justify-content-center align-items-center gap-2">
              <p className="fs-2 fw-bold text-info p-3 border border-2 border-info rounded-3 d-inline-block m-0 user-select-all">{roomId}</p>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => navigator.clipboard.writeText(roomId)} title="Salin ID">Salin</button>
            </div>
            <div className="d-flex justify-content-center align-items-center gap-2">
                <div className="spinner-border text-warning" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
                <p className="fs-4 text-warning m-0">Menunggu pemain lain...</p>
            </div>
          </div>
        );
      case 'online-game':
        if (!onlineGameState) return <div className="text-center"><div className="spinner-border text-info"></div><p>Memuat game...</p></div>;
        return (
            <div className="text-center">
                <div className="mb-5">
                    <h2 className="display-5 fw-bold text-white">Kamu adalah Pemain {playerSymbol}</h2>
                    <p className="text-muted mb-0">Room ID: {roomId}</p>
                    <p className={`mt-3 fs-4 fw-semibold ${onlineGameState.winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p>
                </div>
                {renderGameBoard(onlineGameState.board, onlineGameState.winningLine, handleOnlineClick, onlineGameState.currentPlayer === playerSymbol && !onlineGameState.winner)}
                {onlineGameState.winner && <button onClick={resetOnlineGame} className="mt-5 btn btn-primary btn-lg">Main Lagi</button>}
            </div>
        );
    }
  };

  return (
    <div className="d-flex flex-column align-items-center justify-content-center position-relative" style={{ minHeight: '80vh' }}>
      <BackButton onClick={handleBack} />
      {renderContent()}
    </div>
  );
};

export default TicTacToe;