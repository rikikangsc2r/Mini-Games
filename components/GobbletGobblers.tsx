import React, { useState, useCallback, useEffect } from 'react';
import type { Player } from '../types';
import BackButton from './BackButton';
import useSounds from './useSounds';
import { useOnlineGame, BaseOnlineGameState, OnlinePlayer } from '../hooks/useOnlineGame';
import OnlineGameSetup from './OnlineGameSetup';
import RulesModal from './RulesModal';
import PlayerDisplay from './PlayerDisplay';
import GameLobby from './GameLobby';
import GameModeSelector from './GameModeSelector';

// --- Global Declarations & Helpers ---
declare const firebase: any;
const db = firebase.database();

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

interface OnlineGameState extends BaseOnlineGameState {
  board: BoardState;
  homePiles: HomePiles;
  winningLine: number[][];
   players: {
        X: OnlinePlayer | null;
        O: OnlinePlayer | null;
    };
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

const createInitialOnlineState = (playerName: string, deviceId: string, avatarUrl: string): OnlineGameState => ({
  board: createInitialBoard(),
  homePiles: createInitialPiles(),
  currentPlayer: 'X',
  winner: null,
  winningLine: [],
  players: { X: { deviceId, name: playerName, avatarUrl }, O: null },
  createdAt: firebase.database.ServerValue.TIMESTAMP,
  rematch: { X: false, O: false },
  startingPlayer: 'X',
});

const getRematchState = (): Partial<OnlineGameState> => ({
    board: createInitialBoard(),
    homePiles: createInitialPiles(),
    winningLine: [],
});

const reconstructOnlineState = (gameData: any): OnlineGameState => {
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
                  reconstructedBoard[r][c] = (cellData && typeof cellData === 'object') ? Object.values(cellData) : (Array.isArray(cellData) ? cellData : []);
              });
          }
      });
  }
  
  const reconstructedPiles: HomePiles = { X: [[], [], []], O: [[], [], []] };
  ['X', 'O'].forEach(p_key => {
      const player = p_key as Player;
      const playerPilesData = gameData.homePiles?.[player];
      if (playerPilesData && typeof playerPilesData === 'object') {
          Object.keys(playerPilesData).forEach(pileIndex_key => {
              const pileIndex = parseInt(pileIndex_key, 10);
              if (isNaN(pileIndex) || pileIndex < 0 || pileIndex >= 3) return;
              const pileData = playerPilesData[pileIndex_key];
              reconstructedPiles[player][pileIndex] = (pileData && typeof pileData === 'object') ? Object.values(pileData) : (Array.isArray(pileData) ? pileData : []);
          });
      }
  });

  return {
    ...gameData,
    board: reconstructedBoard,
    homePiles: reconstructedPiles,
    winningLine: gameData.winningLine || [],
    players: gameData.players || { X: null, O: null },
    rematch: gameData.rematch || { X: false, O: false },
  };
};

interface GobbletGobblersProps {
  onBackToMenu: () => void;
}

const GobbletGobblers: React.FC<GobbletGobblersProps> = ({ onBackToMenu }) => {
  // --- State ---
  const [selection, setSelection] = useState<Selection | null>(null);
  const playSound = useSounds();
  
  // Local state
  const [board, setBoard] = useState<BoardState>(createInitialBoard);
  const [homePiles, setHomePiles] = useState<HomePiles>(createInitialPiles);
  const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
  const [winner, setWinner] = useState<Player | null>(null);
  const [winningLine, setWinningLine] = useState<number[][]>([]);
  const [showRules, setShowRules] = useState(false);
  
  // Online hook
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
  } = useOnlineGame('gobblet-games', createInitialOnlineState, reconstructOnlineState, getRematchState, onBackToMenu);

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

    if (gs?.winner || gs?.currentPlayer !== currentTurnPlayer || (isOnline && player !== playerSymbol)) return;

    const pile = gs.homePiles[player][homePileIndex];
    if (pile.length === 0) return;

    const pieceToSelect = pile[pile.length - 1];
    
    if (selection?.from === 'home' && selection.homePileIndex === homePileIndex && selection.piece.player === player) {
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

  const handleBoardCellClick = (viewR: number, viewC: number) => {
    const isOnline = gameMode === 'online';
    const isViewFlipped = isOnline && playerSymbol === 'O';
    const r = isViewFlipped ? 2 - viewR : viewR;
    const c = isViewFlipped ? 2 - viewC : viewC;

    const currentTurnPlayer = isOnline ? playerSymbol : currentPlayer;
    const gs = isOnline ? onlineGameState : { winner, currentPlayer, board, homePiles };

    if (!gs || gs.winner) return;
    if (isOnline && gs.currentPlayer !== playerSymbol) return;

    if (selection) { // --- Placement click ---
      const targetCell = gs.board[r][c];
      const topPieceOnTarget = targetCell.length > 0 ? targetCell[targetCell.length - 1] : null;

      if (topPieceOnTarget && selection.piece.size <= topPieceOnTarget.size) {
        playSound('back');
        setSelection(null);
        return;
      }
      
      playSound('place');
      
      const newBoard = JSON.parse(JSON.stringify(gs.board));
      const newHomePiles = JSON.parse(JSON.stringify(gs.homePiles));
      
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
      const cell = gs.board[r][c];
      if (cell.length === 0 || cell[cell.length - 1].player !== currentTurnPlayer) return;

      playSound('select');
      setSelection({
        piece: cell[cell.length - 1],
        from: { r, c },
      });
    }
  };

  // --- Render Functions ---
  const getStatusMessage = () => {
    if (gameMode === 'local') {
      if (winner) return `Pemain ${winner} Menang!`;
      return `Giliran Pemain ${currentPlayer}`;
    }
    if (onlineGameState) {
      const { winner, currentPlayer, players } = onlineGameState;
      if (winner) {
          const winnerName = players[winner as Player]?.name;
          return winner === playerSymbol ? "Kamu Menang!" : `${winnerName || 'Lawan'} Menang!`;
      }
      return currentPlayer === playerSymbol ? "Giliranmu" : `Menunggu ${players[currentPlayer]?.name || 'Lawan'}`;
    }
    return '';
  };

  const PieceComponent: React.FC<{ piece: Piece, isTop: boolean, isSelected?: boolean }> = ({ piece, isTop, isSelected }) => {
    const sizeMap = ['40%', '70%', '100%'];
    const colorMap = { X: '#0dcaf0', O: '#ffc107' };
    const gs = gameMode === 'online' ? onlineGameState : { winner };
    return (
      <div
        className="position-absolute top-50 start-50 rounded-circle d-flex justify-content-center align-items-center"
        style={{
          width: sizeMap[piece.size], height: sizeMap[piece.size],
          transform: 'translate(-50%, -50%)', backgroundColor: colorMap[piece.player],
          border: `3px solid ${isTop ? '#f8f9fa' : '#495057'}`,
          boxShadow: isSelected ? `0 0 15px 5px ${colorMap[piece.player]}` : (isTop ? '0 2px 8px rgba(0,0,0,0.5)' : 'none'),
          transition: 'all 0.2s ease-in-out', zIndex: piece.size + (isSelected ? 10 : 0),
          cursor: isTop && !gs?.winner ? 'pointer' : 'default',
        }}
      ><div className="rounded-circle" style={{ width: '60%', height: '60%', border: `3px solid rgba(0,0,0,0.2)` }} /></div>
    );
  };
  
  const HomePileComponent: React.FC<{ player: Player, playerInfo: OnlinePlayer | null }> = ({ player, playerInfo }) => {
    const isOnline = gameMode === 'online';
    const gs = isOnline ? onlineGameState : { currentPlayer, winner, homePiles };
    if (!gs) return null;
    const { currentPlayer: turn, winner: gameWinner, homePiles: piles } = gs;
    
    const isPlayerTurn = turn === player && !gameWinner;
    const canInteract = isOnline ? (isPlayerTurn && player === playerSymbol) : isPlayerTurn;
    
    return (
     <div className={`d-flex flex-column align-items-center gap-2 ${isPlayerTurn ? 'border border-3 border-info' : ''} p-2 rounded-3`} style={{transition: 'border 0.3s ease', backgroundColor: '#212529'}}>
        {isOnline ? (
            <PlayerDisplay player={playerInfo} />
        ) : (
            <span className="fw-bold text-light">Pemain {player}</span>
        )}
        <div className="d-flex justify-content-center gap-3 p-2 bg-secondary rounded-3 shadow">
            {piles[player].map((pile, pileIndex) => {
              const isSelected = selection?.from === 'home' && selection.homePileIndex === pileIndex && selection.piece.player === player;
              const topPiece = pile.length > 0 ? pile[pile.length - 1] : null;
              return (
                <div
                  key={pileIndex}
                  className="rounded-3 position-relative"
                  style={{ width: '90px', height: '90px', backgroundColor: '#343a40', cursor: topPiece && canInteract ? 'pointer' : 'default'}}
                  onClick={() => canInteract && handleHomePieceClick(player, pileIndex)}
                >
                  {pile.map((piece, i) => (
                     <PieceComponent key={i} piece={piece} isTop={i === pile.length - 1} isSelected={isSelected && i === pile.length - 1} />
                  ))}
                </div>
              );
            })}
        </div>
      </div>
    );
  };
  
  const renderGameBoard = (boardToRender: BoardState, winningLineToRender: number[][]) => {
    const isFlipped = gameMode === 'online' && playerSymbol === 'O';
    const gs = gameMode === 'online' ? onlineGameState : { winner };
    return (
     <div className="d-grid shadow-lg rounded-3 p-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', width: 'clamp(280px, 90vw, 550px)', aspectRatio: '1 / 1', backgroundColor: '#1a1d20' }}>
      {Array.from({ length: 9 }).map((_, i) => {
        const viewR = Math.floor(i / 3);
        const viewC = i % 3;
        
        const r = isFlipped ? 2 - viewR : viewR;
        const c = isFlipped ? 2 - viewC : viewC;

        const cell = boardToRender[r][c];
        const isSelected = selection?.from !== 'home' && selection?.from.r === r && selection?.from.c === c;
        const isWinningCell = winningLineToRender.some(([wr, wc]) => wr === r && wc === c);
        
        return (
          <div key={i} className="rounded position-relative" style={{ backgroundColor: '#212529', cursor: gs?.winner ? 'default' : 'pointer', transition: 'all 0.3s', border: isWinningCell ? '3px solid #198754' : 'none', boxShadow: isWinningCell ? '0 0 15px #198754' : 'none' }} onClick={() => handleBoardCellClick(viewR, viewC)}>
            {cell.map((piece, pieceIndex) => <PieceComponent key={`${piece.player}-${piece.size}-${pieceIndex}`} piece={piece} isTop={pieceIndex === cell.length - 1} isSelected={isSelected && pieceIndex === cell.length - 1} />)}
          </div>
        );
      })}
    </div>
    );
  };

  const renderOnlineContent = () => {
    if (onlineStep !== 'game') {
        return <OnlineGameSetup {...{ onlineStep, playerProfile, roomInputRef, handleProfileSubmit, handleEnterRoom, isLoading, error, handleChangeProfileRequest }} />;
    }
    if (!onlineGameState) return <div className="text-center"><div className="spinner-border text-info"></div><p className="mt-3">Memuat game...</p></div>;
    if (!onlineGameState.players.O) return <GameLobby roomId={roomId} />;
    
    const mySymbol = playerSymbol!;
    const opponentSymbol = mySymbol === 'X' ? 'O' : 'X';
    const rematchCount = (onlineGameState.rematch.X ? 1 : 0) + (onlineGameState.rematch.O ? 1 : 0);
    const amIReadyForRematch = playerSymbol && onlineGameState.rematch[playerSymbol];
    
    return (
      <div className="d-flex flex-column align-items-center gap-4">
        <div className="text-center">
          <p className="text-muted mb-0">Room: {roomId}</p>
          <p className={`mt-2 fs-4 fw-semibold ${onlineGameState.winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p>
        </div>
        <HomePileComponent player={opponentSymbol} playerInfo={onlineGameState.players[opponentSymbol]} />
        {renderGameBoard(onlineGameState.board, onlineGameState.winningLine)}
        <HomePileComponent player={mySymbol} playerInfo={onlineGameState.players[mySymbol]} />
        {onlineGameState.winner && <button onClick={handleRematch} disabled={!!amIReadyForRematch} className="mt-3 btn btn-primary btn-lg">Rematch ({rematchCount}/2)</button>}
      </div>
    );
  };
  
  const renderContent = () => {
    switch(gameMode) {
      case 'menu':
        return <GameModeSelector title="Gobblet Gobblers" changeGameMode={changeGameMode} />;
      case 'local':
        return (
          <div className="d-flex flex-column align-items-center gap-4">
            <div className="text-center"><p className={`mt-2 fs-4 fw-semibold ${winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p></div>
            <HomePileComponent player="O" playerInfo={null} />
            {renderGameBoard(board, winningLine)}
            <HomePileComponent player="X" playerInfo={null} />
            {winner && <button onClick={resetLocalGame} className="mt-3 btn btn-primary btn-lg">Main Lagi</button>}
          </div>
        );
      case 'online':
        return renderOnlineContent();
    }
  };

  return (
    <div className="d-flex flex-column align-items-center justify-content-center position-relative" style={{ minHeight: '80vh' }}>
      <BackButton onClick={gameMode === 'menu' ? onBackToMenu : () => changeGameMode('menu')} />
       <div className="text-center mb-4">
         {gameMode !== 'menu' && (
            <div className="d-flex justify-content-center align-items-center gap-3">
                <h2 className="display-5 fw-bold text-white mb-0">Gobblet Gobblers</h2>
                <button onClick={() => setShowRules(true)} className="btn btn-sm btn-outline-secondary" aria-label="Tampilkan Aturan">Aturan</button>
            </div>
         )}
       </div>
      {renderContent()}

      <RulesModal title="Aturan Gobblet Gobblers" show={showRules} onClose={() => setShowRules(false)}>
            <p>Seperti Tic-Tac-Toe, tujuannya adalah mendapatkan tiga bidak warnamu secara berurutan.</p>
            <ul className="list-unstyled ps-3">
              <li>- Setiap pemain memiliki 6 bidak dalam 3 ukuran berbeda (2 kecil, 2 sedang, 2 besar).</li>
              <li>- Pada giliranmu, kamu bisa:
                <ol type="a" className="ps-4">
                  <li>Memainkan bidak baru dari tumpukanmu ke kotak kosong.</li>
                  <li>Memindahkan salah satu bidakmu yang sudah ada di papan ke kotak lain.</li>
                </ol>
              </li>
              <li>- Kamu bisa menempatkan bidak yang lebih besar di atas bidak yang lebih kecil (milikmu atau lawan), ini disebut 'Gobbling'.</li>
              <li>- Hati-hati! Jika kamu memindahkan bidak yang menutupi bidak lawan, bidak lawan akan terungkap dan bisa membantu mereka menang.</li>
            </ul>
        </RulesModal>
    </div>
  );
};

export default GobbletGobblers;
