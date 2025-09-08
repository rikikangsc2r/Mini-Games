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
import ChatAndEmotePanel from './ChatAndEmotePanel';
import InGameMessageDisplay from './InGameMessageDisplay';
import OnlineGameWrapper from './OnlineGameWrapper';

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
interface AiMove {
    piece: Piece;
    from: 'home' | { r: number; c: number };
    to: { r: number; c: number };
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
  chatMessages: [],
});

const getRematchState = (): Partial<OnlineGameState> => ({
    board: createInitialBoard(),
    homePiles: createInitialPiles(),
    winningLine: [],
    chatMessages: [],
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
    chatMessages: gameData.chatMessages || [],
  };
};

interface GobbletGobblersProps {
  onBackToMenu: () => void;
  description: string;
}

const GobbletGobblers: React.FC<GobbletGobblersProps> = ({ onBackToMenu, description }) => {
  // --- State ---
  const [selection, setSelection] = useState<Selection | null>(null);
  const playSound = useSounds();
  
  // Local & AI state
  const [board, setBoard] = useState<BoardState>(createInitialBoard);
  const [homePiles, setHomePiles] = useState<HomePiles>(createInitialPiles);
  const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
  const [winner, setWinner] = useState<Player | null>(null);
  const [winningLine, setWinningLine] = useState<number[][]>([]);
  const [showRules, setShowRules] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiStarts, setAiStarts] = useState(false);
  
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
      sendChatMessage,
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
  
  const resetGame = useCallback(() => {
    playSound('select');
    setBoard(createInitialBoard());
    setHomePiles(createInitialPiles());
    setCurrentPlayer('X');
    setWinner(null);
    setWinningLine([]);
    setSelection(null);
  }, [playSound]);
  
  const handleAiRematch = useCallback(() => {
    playSound('select');
    const newAiStarts = !aiStarts;
    setAiStarts(newAiStarts);
    setBoard(createInitialBoard());
    setHomePiles(createInitialPiles());
    setCurrentPlayer(newAiStarts ? 'O' : 'X');
    setWinner(null);
    setWinningLine([]);
    setSelection(null);
  }, [playSound, aiStarts]);

  const applyMove = useCallback((move: AiMove, currentBoard: BoardState, currentHomePiles: HomePiles) => {
      const newBoard = JSON.parse(JSON.stringify(currentBoard));
      const newHomePiles = JSON.parse(JSON.stringify(currentHomePiles));
      newBoard[move.to.r][move.to.c].push(move.piece);
      if (move.from === 'home') {
        newHomePiles[move.piece.player][move.homePileIndex!].pop();
      } else {
        newBoard[move.from.r][move.from.c].pop();
      }
      return { newBoard, newHomePiles };
  }, []);
  
  // --- Handlers ---
  const handleHomePieceClick = (player: Player, homePileIndex: number) => {
    const isOnline = gameMode === 'online';
    const gs = isOnline ? onlineGameState : { winner, currentPlayer, homePiles };
    const currentTurnPlayer = isOnline ? playerSymbol : player;
    const isAi = gameMode === 'ai';

    if (gs?.winner || gs?.currentPlayer !== currentTurnPlayer || (isOnline && player !== playerSymbol) || (isAi && player === 'O')) return;

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
    if (gameMode === 'ai' && gs.currentPlayer === 'O') return;

    if (selection) { // --- Placement click ---
      const targetCell = gs.board[r][c];
      const topPieceOnTarget = targetCell.length > 0 ? targetCell[targetCell.length - 1] : null;

      if (topPieceOnTarget && selection.piece.size <= topPieceOnTarget.size) {
        playSound('back');
        setSelection(null);
        return;
      }
      
      playSound('place');
      
      const { newBoard, newHomePiles } = applyMove({ ...selection, to: {r,c} }, gs.board, gs.homePiles);
      
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

   // --- AI Logic ---
    const evaluateBoard = useCallback((boardState: BoardState, player: Player) => {
        let score = 0;
        const opponent: Player = player === 'X' ? 'O' : 'X';
        const lines = [
            [[0, 0], [0, 1], [0, 2]], [[1, 0], [1, 1], [1, 2]], [[2, 0], [2, 1], [2, 2]],
            [[0, 0], [1, 0], [2, 0]], [[0, 1], [1, 1], [2, 1]], [[0, 2], [1, 2], [2, 2]],
            [[0, 0], [1, 1], [2, 2]], [[0, 2], [1, 1], [2, 0]],
        ];

        for (const line of lines) {
            let playerCount = 0;
            let opponentCount = 0;
            for (const [r, c] of line) {
                const cell = boardState[r][c];
                if (cell.length > 0) {
                    const topPiece = cell[cell.length - 1];
                    if (topPiece.player === player) playerCount++;
                    else opponentCount++;
                }
            }
            if (playerCount === 3) return 1000;
            if (opponentCount === 3) return -1000;
            if (playerCount === 2 && opponentCount === 0) score += 10;
            if (opponentCount === 2 && playerCount === 0) score -= 10;
        }
        return score;
    }, []);

    const minimax = useCallback((boardState: BoardState, piles: HomePiles, depth: number, alpha: number, beta: number, isMaximizing: boolean): { score: number, move: AiMove | null } => {
        const winnerInfo = checkWinner(boardState);
        if (winnerInfo) return { score: winnerInfo.winner === 'O' ? 1000 - depth : -1000 + depth, move: null };
        if (depth === 0) return { score: evaluateBoard(boardState, 'O'), move: null };

        const player = isMaximizing ? 'O' : 'X';
        const possibleMoves: AiMove[] = [];
        // From home piles
        piles[player].forEach((pile, pileIndex) => {
            if (pile.length > 0) {
                const piece = pile[pile.length - 1];
                for (let r = 0; r < 3; r++) {
                    for (let c = 0; c < 3; c++) {
                        const cell = boardState[r][c];
                        const topPiece = cell.length > 0 ? cell[cell.length - 1] : null;
                        if (!topPiece || piece.size > topPiece.size) {
                            possibleMoves.push({ piece, from: 'home', homePileIndex: pileIndex, to: { r, c } });
                        }
                    }
                }
            }
        });
        // From board
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const cell = boardState[r][c];
                if (cell.length > 0 && cell[cell.length - 1].player === player) {
                    const piece = cell[cell.length - 1];
                    for (let tr = 0; tr < 3; tr++) {
                        for (let tc = 0; tc < 3; tc++) {
                            if (r === tr && c === tc) continue;
                            const targetCell = boardState[tr][tc];
                            const topPiece = targetCell.length > 0 ? targetCell[targetCell.length - 1] : null;
                            if (!topPiece || piece.size > topPiece.size) {
                                possibleMoves.push({ piece, from: { r, c }, to: { r: tr, c: tc } });
                            }
                        }
                    }
                }
            }
        }

        let bestMove: AiMove | null = null;
        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of possibleMoves) {
                const { newBoard, newHomePiles } = applyMove(move, boardState, piles);
                const evaluation = minimax(newBoard, newHomePiles, depth - 1, alpha, beta, false).score;
                if (evaluation > maxEval) {
                    maxEval = evaluation;
                    bestMove = move;
                }
                alpha = Math.max(alpha, evaluation);
                if (beta <= alpha) break;
            }
            return { score: maxEval, move: bestMove };
        } else {
            let minEval = Infinity;
            for (const move of possibleMoves) {
                const { newBoard, newHomePiles } = applyMove(move, boardState, piles);
                const evaluation = minimax(newBoard, newHomePiles, depth - 1, alpha, beta, true).score;
                 if (evaluation < minEval) {
                    minEval = evaluation;
                    bestMove = move;
                }
                beta = Math.min(beta, evaluation);
                if (beta <= alpha) break;
            }
            return { score: minEval, move: bestMove };
        }
    }, [checkWinner, evaluateBoard, applyMove]);

    useEffect(() => {
        if (gameMode === 'ai' && currentPlayer === 'O' && !winner) {
            setIsAiThinking(true);
            const timer = setTimeout(() => {
                const { move } = minimax(board, homePiles, 2, -Infinity, Infinity, true); // Depth 2 for performance
                if (move) {
                    playSound('place');
                    const { newBoard, newHomePiles } = applyMove(move, board, homePiles);
                    const result = checkWinner(newBoard);
                    setBoard(newBoard);
                    setHomePiles(newHomePiles);
                    if (result) {
                        playSound('win');
                        setWinner(result.winner);
                        setWinningLine(result.line);
                    } else {
                        setCurrentPlayer('X');
                    }
                }
                setIsAiThinking(false);
            }, 700);
            return () => clearTimeout(timer);
        }
    }, [gameMode, currentPlayer, winner, board, homePiles, minimax, playSound, checkWinner, applyMove]);

  // --- Render Functions ---
  const getStatusMessage = () => {
    if (gameMode === 'local' || gameMode === 'ai') {
        if (winner) return `Pemain ${winner} Menang!`;
         if (gameMode === 'ai') {
            if (isAiThinking) return "AI sedang berpikir...";
            return currentPlayer === 'X' ? "Giliranmu" : "Giliran AI";
        }
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
  
  const HomePileComponent: React.FC<{ player: Player, playerInfo?: OnlinePlayer | null, isAi?: boolean }> = ({ player, playerInfo, isAi = false }) => {
    const isOnline = gameMode === 'online';
    const gs = isOnline ? onlineGameState : { currentPlayer, winner, homePiles };
    if (!gs) return null;
    const { currentPlayer: turn, winner: gameWinner, homePiles: piles } = gs;
    
    const isPlayerTurn = turn === player && !gameWinner;
    const canInteract = isOnline ? (isPlayerTurn && player === playerSymbol) : (isPlayerTurn && !isAi);
    
    return (
     <div className={`d-flex flex-column align-items-center gap-2 p-2 rounded-3`}>
        {isOnline ? (
            <PlayerDisplay player={playerInfo || null} />
        ) : (
             <div className={`${isPlayerTurn ? 'border border-3 border-info' : 'border border-3 border-transparent'} p-2 rounded-3 mb-2`} style={{transition: 'border 0.3s ease', backgroundColor: '#212529'}}>
                <span className="fw-bold text-light">{isAi ? 'AI' : `Pemain ${player}`}</span>
             </div>
        )}
        <div className="d-flex justify-content-center gap-3 p-2 bg-secondary rounded-3 shadow gg-home-piles-container">
            {piles[player].map((pile, pileIndex) => {
              const isSelected = selection?.from === 'home' && selection.homePileIndex === pileIndex && selection.piece.player === player;
              const topPiece = pile.length > 0 ? pile[pile.length - 1] : null;
              return (
                <div
                  key={pileIndex}
                  className="rounded-3 position-relative gg-home-pile-cell"
                  style={{ backgroundColor: '#343a40', cursor: topPiece && canInteract ? 'pointer' : 'default'}}
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
            opponentSideContent={<HomePileComponent player={opponentSymbol} playerInfo={onlineGameState.players[opponentSymbol]} />}
            mySideContent={<HomePileComponent player={mySymbol} playerInfo={onlineGameState.players[mySymbol]} />}
        >
          {renderGameBoard(onlineGameState.board, onlineGameState.winningLine)}
        </OnlineGameWrapper>
    );
  };
  
  const renderContent = () => {
    switch(gameMode) {
      case 'menu':
        return <GameModeSelector title="Gobblet Gobblers" description={description} changeGameMode={changeGameMode} />;
      case 'local':
        return (
          <div className="d-flex flex-column align-items-center gap-4">
            <div className="text-center"><p className={`mt-2 fs-4 fw-semibold ${winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p></div>
            <HomePileComponent player="O" />
            {renderGameBoard(board, winningLine)}
            <HomePileComponent player="X" />
            {winner && <button onClick={resetGame} className="mt-3 btn btn-primary btn-lg">Main Lagi</button>}
          </div>
        );
      case 'ai':
        return (
          <div className="d-flex flex-column align-items-center gap-4">
            <div className="text-center"><p className={`mt-2 fs-4 fw-semibold ${winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p></div>
            <HomePileComponent player="O" isAi={gameMode === 'ai'} />
            {renderGameBoard(board, winningLine)}
            <HomePileComponent player="X" />
            {winner && <button onClick={handleAiRematch} className="mt-3 btn btn-primary btn-lg">Rematch</button>}
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
