import React, { useState, useEffect, useCallback } from 'react';
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

// Objek firebase global dari skrip di index.html
declare const firebase: any;
const db = firebase.database();

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
}

const TicTacToe: React.FC<TicTacToeProps> = ({ onBackToMenu }) => {
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
  
  // State game lokal
  const [board, setBoard] = useState<(Player | null)[]>(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
  const [winner, setWinner] = useState<Player | 'Draw' | null>(null);
  const [winningLine, setWinningLine] = useState<number[]>([]);
  const [showRules, setShowRules] = useState(false);

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

  const getStatusMessage = () => {
    if (gameMode === 'local') {
        if (winner) return winner === 'Draw' ? "Hasilnya Seri!" : `Pemain ${winner} Menang!`;
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

      const isMyTurn = onlineGameState.currentPlayer === playerSymbol && !onlineGameState.winner;
      const rematchCount = (onlineGameState.rematch.X ? 1 : 0) + (onlineGameState.rematch.O ? 1 : 0);
      const amIReadyForRematch = playerSymbol && onlineGameState.rematch[playerSymbol];
      return (
          <div className="text-center w-100 position-relative d-flex flex-column align-items-center">
              <div className="mb-4 d-flex flex-column align-items-center gap-3">
                  <div className="d-flex justify-content-center align-items-center gap-3 w-100 position-relative" style={{maxWidth: '450px'}}>
                      <PlayerDisplay player={onlineGameState.players.X} />
                      <span className="gradient-text fw-bolder fs-4">VS</span>
                      <PlayerDisplay player={onlineGameState.players.O} />
                      <InGameMessageDisplay
                          messages={onlineGameState.chatMessages}
                          players={onlineGameState.players}
                          myPlayerSymbol={playerSymbol}
                       />
                  </div>
                  <p className="text-muted mb-0">Room: {roomId}</p>
                  <p className={`mt-2 fs-4 fw-semibold ${onlineGameState.winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p>
              </div>
              {renderGameBoard(onlineGameState.board, onlineGameState.winningLine, handleOnlineClick, isMyTurn)}
              
              <ChatAndEmotePanel onSendMessage={sendChatMessage} disabled={!isMyTurn} />

              {onlineGameState.winner && (
                  <button onClick={handleRematch} disabled={!!amIReadyForRematch} className="mt-5 btn btn-primary btn-lg">
                        Rematch ({rematchCount}/2)
                  </button>
              )}
          </div>
      );
  };

  const renderContent = () => {
    switch(gameMode) {
      case 'menu':
        return <GameModeSelector title="Tic-Tac-Toe" changeGameMode={changeGameMode} />;
      case 'local':
        return (
          <div className="text-center">
            <div className="mb-5">
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