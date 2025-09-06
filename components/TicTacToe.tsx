import React, { useState, useEffect, useCallback } from 'react';
import type { Player } from '../types';
import BackButton from './BackButton';
import useSounds from './useSounds';
import GameBoard from './GameBoard';
import { useOnlineGame, BaseOnlineGameState } from '../hooks/useOnlineGame';
import OnlineGameSetup from './OnlineGameSetup';

// Objek firebase global dari skrip di index.html
declare const firebase: any;
const db = firebase.database();

interface OnlineGameState extends BaseOnlineGameState {
    board: (Player | null)[];
    winningLine: number[];
}

const createInitialOnlineState = (playerName: string, deviceId: string): OnlineGameState => ({
    board: Array(9).fill(null),
    currentPlayer: 'X',
    winner: null,
    winningLine: [],
    players: { X: { deviceId, name: playerName }, O: null },
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    rematch: { X: false, O: false },
    startingPlayer: 'X',
});

const reconstructOnlineState = (gameData: any): OnlineGameState => {
    const reconstructedBoard = Array(9).fill(null);
    if (gameData.board && typeof gameData.board === 'object') {
        Object.keys(gameData.board).forEach(key => {
            const index = parseInt(key, 10);
            if (!isNaN(index) && index >= 0 && index < 9) {
                reconstructedBoard[index] = gameData.board[key];
            }
        });
    }
     return {
        ...gameData,
        board: reconstructedBoard,
        winningLine: gameData.winningLine || [],
        players: gameData.players || { X: null, O: null },
        rematch: gameData.rematch || { X: false, O: false },
    };
};

const TicTacToe: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const playSound = useSounds();
  const {
      gameMode,
      onlineStep,
      playerName,
      roomId,
      playerSymbol,
      onlineGameState,
      isLoading,
      error,
      nameInputRef,
      roomInputRef,
      handleNameSubmit,
      handleEnterRoom,
      handleOnlineBack,
      handleRematch,
      changeGameMode,
  } = useOnlineGame('games', createInitialOnlineState, reconstructOnlineState);
  
  // State game lokal
  const [board, setBoard] = useState<(Player | null)[]>(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
  const [winner, setWinner] = useState<Player | 'Draw' | null>(null);
  const [winningLine, setWinningLine] = useState<number[]>([]);

  const calculateWinner = useCallback((squares: (Player | null)[]): { winner: Player | 'Draw', line: number[] } | null => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (const line of lines) {
      const [a, b, c] = line;
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return { winner: squares[a] as Player, line };
      }
    }
    if (squares.every(square => square !== null)) {
        return { winner: 'Draw', line: [] };
    }
    return null;
  }, []);
  
  // Efek untuk game lokal
  useEffect(() => {
    if (gameMode !== 'local') return;
    const result = calculateWinner(board);
    if (result) {
      if (!winner) { // Mainkan suara hanya saat transisi
          if (result.winner === 'Draw') playSound('draw');
          else playSound('win');
      }
      setWinner(result.winner);
      setWinningLine(result.line);
    }
  }, [board, gameMode, calculateWinner, playSound, winner]);

  // Efek untuk rematch online
  useEffect(() => {
    if (gameMode === 'online' && onlineGameState?.rematch.X && onlineGameState?.rematch.O) {
        const roomRef = db.ref(`games/${roomId}`);
        const newStartingPlayer = onlineGameState.startingPlayer === 'X' ? 'O' : 'X';
        roomRef.update({
            board: Array(9).fill(null),
            currentPlayer: newStartingPlayer,
            winner: null,
            winningLine: [],
            rematch: { X: false, O: false },
            startingPlayer: newStartingPlayer
        });
    }
  }, [onlineGameState, gameMode, roomId]);


  const handleLocalClick = (index: number) => {
    if (winner || board[index]) return;
    playSound('place');
    const newBoard = [...board];
    newBoard[index] = currentPlayer;
    setBoard(newBoard);
    setCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X');
  };

  const resetLocalGame = () => {
    playSound('select');
    setBoard(Array(9).fill(null));
    setCurrentPlayer('X');
    setWinner(null);
    setWinningLine([]);
  };

  const handleOnlineClick = (index: number) => {
    if (!onlineGameState || onlineGameState.winner || onlineGameState.board[index] || onlineGameState.currentPlayer !== playerSymbol) {
        return;
    }
    playSound('place');
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
  
  const handleBack = () => {
    if (gameMode === 'online') {
      handleOnlineBack();
    } else {
      onBack();
    }
  }

  const getStatusMessage = () => {
    if (gameMode === 'local') {
        if (winner) return winner === 'Draw' ? "Hasilnya Seri!" : `Pemain ${winner} Menang!`;
        return `Giliran Pemain ${currentPlayer}`;
    }
    if (onlineGameState) {
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
      <GameBoard
        size={3}
        boardState={boardState}
        winningLine={winningLineState}
        onCellClick={handleClick}
        disabled={!isGameActive}
      />
  );

  const renderOnlineContent = () => {
      if (onlineStep === 'name' || onlineStep === 'room') {
        return <OnlineGameSetup {...{ onlineStep, playerName, nameInputRef, roomInputRef, handleNameSubmit, handleEnterRoom, isLoading, error }} />;
      }

      if (onlineStep === 'game') {
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
      return null;
  };

  const renderContent = () => {
    switch(gameMode) {
      case 'menu':
        return (
          <div className="text-center">
            <h2 className="display-5 fw-bold text-white mb-5">Tic-Tac-Toe</h2>
            <div className="d-grid gap-3 col-sm-8 col-md-6 col-lg-4 mx-auto">
              <button onClick={() => changeGameMode('local')} className="btn btn-primary btn-lg">Mabar Lokal</button>
              <button onClick={() => changeGameMode('online')} className="btn btn-info btn-lg">Mabar Online</button>
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
      <BackButton onClick={gameMode === 'menu' ? onBack : handleBack} />
      {renderContent()}
    </div>
  );
};

export default TicTacToe;
