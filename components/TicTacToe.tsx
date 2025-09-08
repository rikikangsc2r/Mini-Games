import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Player } from '../types';
import BackButton from './BackButton';
import useSounds from './useSounds';
import GameBoard from './GameBoard';
import { useOnlineGame, BaseOnlineGameState, OnlinePlayer } from '../hooks/useOnlineGame';
import OnlineGameSetup from './OnlineGameSetup';
import RulesModal from './RulesModal';
import PlayerDisplay from './PlayerDisplay';
import GameLobby from './GameLobby';
import GameModeSelector from './GameModeSelector';
import ChatAndEmotePanel from './ChatAndEmotePanel';
import InGameMessageDisplay from './InGameMessageDisplay';
import OnlineGameWrapper from './OnlineGameWrapper';

// Objek firebase global dari skrip di index.html
declare const firebase: any;
const db = firebase.database();

function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T | undefined>(undefined);
    useEffect(() => {
        ref.current = value;
    }, [value]);
    return ref.current;
}

interface OnlineGameState extends BaseOnlineGameState {
    board: (Player | null)[];
    winningLine: number[];
    players: {
        X: OnlinePlayer | null;
        O: OnlinePlayer | null;
    };
}

const createInitialOnlineState = (playerName: string, deviceId: string, avatarUrl: string): OnlineGameState => ({
    board: Array(9).fill(null),
    currentPlayer: 'X',
    winner: null,
    winningLine: [],
    players: { X: { deviceId, name: playerName, avatarUrl }, O: null },
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    rematch: { X: false, O: false },
    startingPlayer: 'X',
    chatMessages: [],
});

const getRematchState = (): Partial<OnlineGameState> => ({
    board: Array(9).fill(null),
    winningLine: [],
    chatMessages: [],
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
        chatMessages: gameData.chatMessages || [],
    };
};

interface TicTacToeProps {
  onBackToMenu: () => void;
  description: string;
}

const TicTacToe: React.FC<TicTacToeProps> = ({ onBackToMenu, description }) => {
  const playSound = useSounds();
  const {
      gameMode,
      onlineStep,
      playerProfile,
      roomId,
      playerSymbol,
      onlineGameState,
      isLoading,
      error,
      roomInputRef,
      handleProfileSubmit,
      handleEnterRoom,
      handleRematch,
      changeGameMode,
      handleChangeProfileRequest,
      sendChatMessage,
  } = useOnlineGame('games', createInitialOnlineState, reconstructOnlineState, getRematchState, onBackToMenu);
  
  const prevOnlineGameState = usePrevious(onlineGameState);
  
  // State game lokal & AI
  const [board, setBoard] = useState<(Player | null)[]>(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
  const [winner, setWinner] = useState<Player | 'Draw' | null>(null);
  const [winningLine, setWinningLine] = useState<number[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiStarts, setAiStarts] = useState(false);

  // Efek untuk suara game online
  useEffect(() => {
    if (gameMode !== 'online' || !onlineGameState || !prevOnlineGameState || !playerSymbol) return;

    // Lawan bergerak (sekarang giliran saya)
    if (
        onlineGameState.currentPlayer === playerSymbol &&
        prevOnlineGameState.currentPlayer !== playerSymbol &&
        !onlineGameState.winner
    ) {
        playSound('place');
    }
  }, [onlineGameState, prevOnlineGameState, gameMode, playerSymbol, playSound]);

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
  
  // Efek untuk game lokal & AI
  useEffect(() => {
    if (gameMode !== 'local' && gameMode !== 'ai') return;
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

  const minimax = useCallback((boardState: (Player | null)[], depth: number, isMax: boolean): number => {
    const result = calculateWinner(boardState);
    if (result) {
        if (result.winner === 'O') return 10 - depth;
        if (result.winner === 'X') return -10 + depth;
        return 0; // Draw
    }

    if (isMax) {
        let best = -Infinity;
        for (let i = 0; i < 9; i++) {
            if (boardState[i] === null) {
                boardState[i] = 'O';
                best = Math.max(best, minimax(boardState, depth + 1, !isMax));
                boardState[i] = null;
            }
        }
        return best;
    } else {
        let best = Infinity;
        for (let i = 0; i < 9; i++) {
            if (boardState[i] === null) {
                boardState[i] = 'X';
                best = Math.min(best, minimax(boardState, depth + 1, !isMax));
                boardState[i] = null;
            }
        }
        return best;
    }
  }, [calculateWinner]);

  const findBestMove = useCallback((boardState: (Player | null)[]) => {
      let bestVal = -Infinity;
      let bestMove = -1;
      for (let i = 0; i < 9; i++) {
          if (boardState[i] === null) {
              boardState[i] = 'O';
              let moveVal = minimax(boardState, 0, false);
              boardState[i] = null;
              if (moveVal > bestVal) {
                  bestMove = i;
                  bestVal = moveVal;
              }
          }
      }
      return bestMove;
  }, [minimax]);

  const handleNonOnlineClick = (index: number) => {
    if (winner || board[index] || (gameMode === 'ai' && currentPlayer === 'O')) return;
    playSound('place');
    const newBoard = [...board];
    newBoard[index] = currentPlayer;
    setBoard(newBoard);
    setCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X');
  };

  useEffect(() => {
    if (gameMode === 'ai' && currentPlayer === 'O' && !winner) {
      setIsAiThinking(true);
      const timer = setTimeout(() => {
        const aiMove = findBestMove([...board]);
        if (aiMove !== -1) {
            const newBoard = [...board];
            newBoard[aiMove] = 'O';
            setBoard(newBoard);
            setCurrentPlayer('X');
            playSound('place');
        }
        setIsAiThinking(false);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [gameMode, currentPlayer, winner, board, findBestMove, playSound]);

  const resetGame = () => {
    playSound('select');
    setBoard(Array(9).fill(null));
    setCurrentPlayer('X');
    setWinner(null);
    setWinningLine([]);
  };
  
  const handleAiRematch = () => {
      playSound('select');
      const newAiStarts = !aiStarts;
      setAiStarts(newAiStarts);
      setBoard(Array(9).fill(null));
      setCurrentPlayer(newAiStarts ? 'O' : 'X');
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

  const getStatusMessage = () => {
    if (gameMode === 'local' || gameMode === 'ai') {
        if (winner) {
          if (winner === 'Draw') return "Hasilnya Seri!";
          if (gameMode === 'ai') {
              return winner === 'X' ? "Kamu Menang!" : "AI Menang!";
          }
          return `Pemain ${winner} Menang!`;
        }
        if (gameMode === 'ai') {
            if (isAiThinking) return "AI sedang berpikir...";
            return currentPlayer === 'X' ? "Giliranmu" : "Giliran AI";
        }
        return `Giliran Pemain ${currentPlayer}`;
    }
    if (onlineGameState) {
        const { winner: onlineWinner, currentPlayer: onlineCurrentPlayer, players } = onlineGameState;
        
        if (onlineWinner) {
            if (onlineWinner === 'Draw') return "Hasilnya Seri!";
            const winnerName = players[onlineWinner as Player]?.name;
            return onlineWinner === playerSymbol ? "Kamu Menang!" : `${winnerName || 'Lawan'} Menang!`;
        }
        return onlineCurrentPlayer === playerSymbol ? "Giliranmu" : `Menunggu ${players[onlineCurrentPlayer]?.name || 'Lawan'}`;
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
      if (onlineStep !== 'game') {
        return <OnlineGameSetup {...{ onlineStep, playerProfile, roomInputRef, handleProfileSubmit, handleEnterRoom, isLoading, error, handleChangeProfileRequest }} />;
      }
      if (!onlineGameState) return <div className="text-center"><div className="spinner-border text-info"></div><p className="mt-3">Memuat game...</p></div>;
      if (!onlineGameState.players.O) return <GameLobby roomId={roomId} />;

      const mySymbol = playerSymbol!;
      const opponentSymbol = mySymbol === 'X' ? 'O' : 'X';

      return (
          <OnlineGameWrapper
              myPlayer={onlineGameState.players[mySymbol]}
              opponent={onlineGameState.players[opponentSymbol]}
              mySymbol={mySymbol}
              roomId={roomId}
              statusMessage={getStatusMessage()}
              isMyTurn={onlineGameState.currentPlayer === playerSymbol && !onlineGameState.winner}
              isGameOver={!!onlineGameState.winner}
              rematchCount={(onlineGameState.rematch.X ? 1 : 0) + (onlineGameState.rematch.O ? 1 : 0)}
              amIReadyForRematch={!!(playerSymbol && onlineGameState.rematch[playerSymbol])}
              onRematch={handleRematch}
              chatMessages={onlineGameState.chatMessages}
              onSendMessage={sendChatMessage}
          >
              {renderGameBoard(
                  onlineGameState.board,
                  onlineGameState.winningLine,
                  handleOnlineClick,
                  onlineGameState.currentPlayer === playerSymbol && !onlineGameState.winner
              )}
          </OnlineGameWrapper>
      );
  };

  const renderContent = () => {
    switch(gameMode) {
      case 'menu':
        return <GameModeSelector title="Tic-Tac-Toe" description={description} changeGameMode={changeGameMode} />;
      case 'local':
        return (
          <div className="text-center">
            <div className="mb-5">
                <p className={`mt-4 fs-4 fw-semibold ${winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p>
            </div>
            {renderGameBoard(board, winningLine, handleNonOnlineClick, !winner)}
            {winner && <button onClick={resetGame} className="mt-5 btn btn-primary btn-lg">Main Lagi</button>}
          </div>
        );
      case 'ai':
        return (
          <div className="text-center">
            <div className="mb-5">
                <p className={`mt-4 fs-4 fw-semibold ${winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p>
            </div>
            {renderGameBoard(board, winningLine, handleNonOnlineClick, !winner && !isAiThinking)}
            {winner && <button onClick={handleAiRematch} className="mt-5 btn btn-primary btn-lg">Rematch</button>}
          </div>
        );
      case 'online':
        return renderOnlineContent();
    }
  };

  return (
    <div className="d-flex flex-column align-items-center justify-content-center position-relative" style={{ minHeight: '80vh' }}>
      <BackButton onClick={gameMode === 'menu' ? onBackToMenu : () => changeGameMode('menu')} />
      
      {gameMode !== 'menu' && (
        <div className="text-center mb-4">
          <div className="d-flex justify-content-center align-items-center gap-3">
            <h2 className="display-5 fw-bold text-white mb-0">Tic-Tac-Toe</h2>
            <button onClick={() => setShowRules(true)} className="btn btn-sm btn-outline-secondary" aria-label="Tampilkan Aturan">Aturan</button>
          </div>
        </div>
      )}

      {renderContent()}

      <RulesModal title="Aturan Tic-Tac-Toe" show={showRules} onClose={() => setShowRules(false)}>
        <p>Tujuan permainan ini adalah menjadi pemain pertama yang mendapatkan tiga tanda (X atau O) berturut-turut.</p>
        <ul className="list-unstyled ps-3">
          <li>- Papan permainan berukuran 3x3 kotak.</li>
          <li>- Pemain X memulai lebih dulu.</li>
          <li>- Pemain bergiliran menempatkan tanda mereka di kotak kosong.</li>
          <li>- Barisan dapat berupa horizontal, vertikal, atau diagonal.</li>
          <li>- Jika semua kotak terisi dan tidak ada pemenang, permainan berakhir seri.</li>
        </ul>
      </RulesModal>
    </div>
  );
};

export default TicTacToe;