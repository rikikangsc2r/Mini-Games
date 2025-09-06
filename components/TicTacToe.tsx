import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Player } from '../types';
import BackButton from './BackButton';

// Objek firebase global dari skrip di index.html
declare const firebase: any;

// Helper untuk mendapatkan atau membuat ID perangkat
const getDeviceId = (): string => {
    let id = localStorage.getItem('deviceId');
    if (!id) {
        id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('deviceId', id);
    }
    return id;
};

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

type GameMode = 'menu' | 'local' | 'online';
type OnlineStep = 'name' | 'room' | 'game';

interface OnlinePlayer {
    deviceId: string;
    name: string;
}

interface OnlineGameState {
    board: (Player | null)[];
    currentPlayer: Player;
    winner: Player | 'Draw' | null;
    winningLine: number[];
    players: {
        X: OnlinePlayer | null;
        O: OnlinePlayer | null;
    };
    createdAt: number;
    rematch: { X: boolean; O: boolean };
    startingPlayer: Player;
}

const TicTacToe: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [onlineStep, setOnlineStep] = useState<OnlineStep>('name');
  
  // State game online
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [playerSymbol, setPlayerSymbol] = useState<Player | null>(null);
  const [onlineGameState, setOnlineGameState] = useState<OnlineGameState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const nameInputRef = useRef<HTMLInputElement>(null);
  const roomInputRef = useRef<HTMLInputElement>(null);
  const deviceId = useRef<string>(getDeviceId());

  // State game lokal
  const [board, setBoard] = useState<(Player | null)[]>(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
  const [winner, setWinner] = useState<Player | 'Draw' | null>(null);
  const [winningLine, setWinningLine] = useState<number[]>([]);

  const db = firebase.database();

  useEffect(() => {
    const storedName = localStorage.getItem('playerName');
    if (storedName) {
      setPlayerName(storedName);
      setOnlineStep('room');
    }
  }, []);

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
  const handleNameSubmit = () => {
      const name = nameInputRef.current?.value.trim();
      if (name) {
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
      setIsLoading(true);
      setError('');
      
      const roomRef = db.ref(`games/${enteredRoomId}`);
      try {
          const snapshot = await roomRef.get();
          const gameData: OnlineGameState | null = snapshot.val();
          const isExpired = gameData && (Date.now() - gameData.createdAt > 3600 * 1000); // 1 jam

          // Buat room baru jika tidak ada atau sudah kedaluwarsa
          if (!snapshot.exists() || isExpired) {
              const newGame: OnlineGameState = {
                  board: Array(9).fill(null),
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
              localStorage.setItem('tictactoe_roomId', enteredRoomId);
              setOnlineStep('game');
          } else { // Gabung room yang ada
              if (gameData.players.X?.deviceId === deviceId.current) { // Gabung kembali sebagai X
                  setRoomId(enteredRoomId);
                  setPlayerSymbol('X');
                  setOnlineStep('game');
              } else if (gameData.players.O?.deviceId === deviceId.current) { // Gabung kembali sebagai O
                  setRoomId(enteredRoomId);
                  setPlayerSymbol('O');
                  setOnlineStep('game');
              } else if (!gameData.players.O) { // Bergabung sebagai O
                  await roomRef.child('players/O').set({ deviceId: deviceId.current, name: playerName });
                  setRoomId(enteredRoomId);
                  setPlayerSymbol('O');
                  localStorage.setItem('tictactoe_roomId', enteredRoomId);
                  setOnlineStep('game');
              } else {
                  setError('Room sudah penuh.');
              }
          }
      } catch (e) {
          setError('Gagal masuk room. Coba lagi.');
          console.error(e);
      } finally {
          setIsLoading(false);
      }
  }, [db, playerName]);


  useEffect(() => {
    if (onlineStep !== 'game' || !roomId || !db) return;
    
    const roomRef = db.ref(`games/${roomId}`);
    const listener = roomRef.on('value', (snapshot: any) => {
        if (snapshot.exists()) {
            const gameData = snapshot.val();
            const reconstructedBoard = Array(9).fill(null);
            if (gameData.board && typeof gameData.board === 'object') {
                Object.keys(gameData.board).forEach(key => {
                    const index = parseInt(key, 10);
                    if (!isNaN(index) && index >= 0 && index < 9) {
                        reconstructedBoard[index] = gameData.board[key];
                    }
                });
            }
             const sanitizedGameData: OnlineGameState = {
                ...gameData,
                board: reconstructedBoard,
                winningLine: gameData.winningLine || [],
                players: gameData.players || { X: null, O: null },
                rematch: gameData.rematch || { X: false, O: false },
            };
            setOnlineGameState(sanitizedGameData);

            // Cek untuk memulai rematch
            if (sanitizedGameData.rematch.X && sanitizedGameData.rematch.O) {
                const newStartingPlayer = sanitizedGameData.startingPlayer === 'X' ? 'O' : 'X';
                roomRef.update({
                    board: Array(9).fill(null),
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
  }, [roomId, db, onlineStep]);

  const handleOnlineClick = (index: number) => {
    if (!onlineGameState || onlineGameState.winner || onlineGameState.board[index] || onlineGameState.currentPlayer !== playerSymbol) {
        return;
    }
    const newBoard = [...onlineGameState.board];
    newBoard[index] = onlineGameState.currentPlayer;
    const result = calculateWinner(newBoard);
    
    const updates: Partial<Pick<OnlineGameState, 'board' | 'currentPlayer' | 'winner' | 'winningLine'>> = {
        board: newBoard,
        currentPlayer: onlineGameState.currentPlayer === 'X' ? 'O' : 'X'
    };
    if (result) {
        updates.winner = result.winner;
        updates.winningLine = result.line;
    }
    db.ref(`games/${roomId}`).update(updates);
  };

  const handleRematch = () => {
      if (!roomId || !playerSymbol) return;
      db.ref(`games/${roomId}/rematch/${playerSymbol}`).set(true);
  };

  const handleBack = () => {
      setError('');
      if (gameMode === 'local' || gameMode === 'menu') {
          onBack();
      } else if (gameMode === 'online') {
          if (onlineStep === 'game' || onlineStep === 'room') {
            localStorage.removeItem('tictactoe_roomId');
            setRoomId('');
            setPlayerSymbol(null);
            setOnlineGameState(null);
            setOnlineStep('room');
            if (onlineStep === 'room') setGameMode('menu');
          } else if (onlineStep === 'name') {
            setGameMode('menu');
          }
      }
  };
  
  const getStatusMessage = () => {
    if (gameMode === 'local') {
        if (winner) return winner === 'Draw' ? "Hasilnya Seri!" : `Pemain ${winner} Menang!`;
        return `Giliran Pemain ${currentPlayer}`;
    }
    if (onlineStep === 'game' && onlineGameState) {
        const { winner: onlineWinner, currentPlayer: onlineCurrentPlayer, players } = onlineGameState;
        const opponentName = playerSymbol === 'X' ? players.O?.name : players.X?.name;

        if (onlineWinner) {
            if (onlineWinner === 'Draw') return "Hasilnya Seri!";
            return onlineWinner === playerSymbol ? "Kamu Menang!" : `${opponentName || 'Lawan'} Menang!`;
        }
        return onlineCurrentPlayer === playerSymbol ? "Giliranmu" : `Menunggu ${opponentName || 'Lawan'}`;
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

  const renderOnlineContent = () => {
      switch (onlineStep) {
          case 'name':
              return (
                  <div className="text-center col-md-8 col-lg-6 mx-auto">
                      <h2 className="display-5 fw-bold text-white mb-4">Masukkan Namamu</h2>
                      <div className="input-group">
                          <input ref={nameInputRef} type="text" className="form-control form-control-lg bg-secondary border-secondary text-light" placeholder="Nama Pemain" aria-label="Nama Pemain" />
                          <button onClick={handleNameSubmit} className="btn btn-info">Lanjut</button>
                      </div>
                      {error && <p className="text-danger mt-2">{error}</p>}
                  </div>
              );
          case 'room':
               return (
                  <div className="text-center col-md-8 col-lg-6 mx-auto">
                      <h2 className="display-5 fw-bold text-white mb-3">Selamat Datang, {playerName}!</h2>
                      <p className="fs-5 text-muted mb-4">Masukkan nama room untuk bermain.</p>
                      <div className="input-group">
                          <input ref={roomInputRef} type="text" className="form-control form-control-lg bg-secondary border-secondary text-light" placeholder="Nama Room" aria-label="Nama Room" />
                          <button onClick={handleEnterRoom} disabled={isLoading} className="btn btn-info">
                              {isLoading ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> : 'Masuk'}
                          </button>
                      </div>
                      {error && <p className="text-danger mt-2">{error}</p>}
                  </div>
              );
          case 'game':
              if (!onlineGameState) return <div className="text-center"><div className="spinner-border text-info"></div><p className="mt-3">Memuat game...</p></div>;
              if (!onlineGameState.players.O) { // Tampilan Lobby
                  return (
                      <div className="text-center">
                          <h2 className="display-5 fw-bold text-white mb-3">Room: {roomId}</h2>
                          <p className="fs-5 text-muted">Bagikan nama room ini ke temanmu</p>
                           <div className="my-4 d-flex justify-content-center align-items-center gap-2">
                                <div className="spinner-border text-warning" role="status"><span className="visually-hidden">Loading...</span></div>
                                <p className="fs-4 text-warning m-0">Menunggu pemain lain...</p>
                            </div>
                      </div>
                  );
              }
              const rematchCount = (onlineGameState.rematch.X ? 1 : 0) + (onlineGameState.rematch.O ? 1 : 0);
              const amIReadyForRematch = playerSymbol && onlineGameState.rematch[playerSymbol];
              return (
                  <div className="text-center">
                      <div className="mb-4">
                          <h2 className="display-5 fw-bold text-white">{onlineGameState.players.X?.name || '?'} vs {onlineGameState.players.O?.name || '?'}</h2>
                          <p className="text-muted mb-0">Room: {roomId}</p>
                          <p className={`mt-3 fs-4 fw-semibold ${onlineGameState.winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p>
                      </div>
                      {renderGameBoard(onlineGameState.board, onlineGameState.winningLine, handleOnlineClick, onlineGameState.currentPlayer === playerSymbol && !onlineGameState.winner)}
                      {onlineGameState.winner && (
                          <button onClick={handleRematch} disabled={!!amIReadyForRematch} className="mt-5 btn btn-primary btn-lg">
                                Rematch ({rematchCount}/2)
                          </button>
                      )}
                  </div>
              );
      }
  };

  const renderContent = () => {
    switch(gameMode) {
      case 'menu':
        return (
          <div className="text-center">
            <h2 className="display-5 fw-bold text-white mb-5">Tic-Tac-Toe</h2>
            <div className="d-grid gap-3 col-sm-8 col-md-6 col-lg-4 mx-auto">
              <button onClick={() => setGameMode('local')} className="btn btn-primary btn-lg">Mabar Lokal</button>
              <button onClick={() => setGameMode('online')} className="btn btn-info btn-lg">Mabar Online</button>
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
      case 'online':
        return renderOnlineContent();
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
