import React, { useState, useEffect, useMemo, useCallback } from 'react';
import BackButton from './BackButton';
import useSounds from './useSounds';
import { useOnlineGame, BaseOnlineGameState } from '../hooks/useOnlineGame';
import OnlineGameSetup from './OnlineGameSetup';
import type { Player } from '../types';

// --- Global Declarations & Helpers ---
declare const firebase: any;
const db = firebase.database();
const ChessJS = (window as any).Chess;

// --- Type Definitions ---
type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type PieceColor = 'w' | 'b';
interface Piece { type: PieceType; color: PieceColor; }
interface Square { square: string; piece: Piece | null; }
interface Move { from: string; to: string; promotion?: PieceType }

interface OnlineChessGameState extends BaseOnlineGameState {
    fen: string;
    lastMove: { from: string, to: string } | null;
}

// --- Helper Functions ---
const createInitialOnlineState = (playerName: string, deviceId: string): OnlineChessGameState => ({
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    lastMove: null,
    currentPlayer: 'X', // 'X' is always white
    winner: null,
    players: { X: { deviceId, name: playerName }, O: null },
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    rematch: { X: false, O: false },
    startingPlayer: 'X',
});

const reconstructOnlineState = (gameData: any): OnlineChessGameState => ({
    ...gameData,
    fen: gameData.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    lastMove: gameData.lastMove || null,
    players: gameData.players || { X: null, O: null },
    rematch: gameData.rematch || { X: false, O: false },
});

const UNICODE_PIECES: Record<PieceColor, Record<PieceType, string>> = {
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
};

// --- React Components ---

interface SquareProps {
  square: string;
  piece: Piece | null;
  pieceOnSquare: Piece | null;
  isLight: boolean;
  isSelected: boolean;
  isPossible: boolean;
  isLastMove: boolean;
  isCheck: boolean;
  onClick: (square: string) => void;
}

const SquareComponent: React.FC<SquareProps> = React.memo(({
  square, piece, pieceOnSquare, isLight, isSelected, isLastMove, isCheck, isPossible, onClick
}) => {
  return (
    <div
      onClick={() => onClick(square)}
      className={`chess-square ${isLight ? 'light' : 'dark'} ${isSelected ? 'selected' : ''}`}
      role="button"
      aria-label={`Square ${square} with ${piece ? `${piece.color} ${piece.type}` : 'empty'}`}
    >
      {isLastMove && <div className="square-overlay last-move" />}
      {isCheck && <div className="square-overlay check" />}
      
      {piece && (
        <span className={`chess-piece ${piece.color === 'w' ? 'white' : 'black'}`}>
          {UNICODE_PIECES[piece.color][piece.type]}
        </span>
      )}
      
      {isPossible && (
        <div className="square-overlay possible-move">
          {pieceOnSquare ? <div className="capture-ring" /> : <div className="move-dot" />}
        </div>
      )}
    </div>
  );
});


const Chess: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    // --- State ---
    const [game, setGame] = useState(() => new ChessJS());
    const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
    const [promotionMove, setPromotionMove] = useState<Move | null>(null);
    const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
    const [capturedPieces, setCapturedPieces] = useState<Record<PieceColor, Piece[]>>({ w: [], b: [] });
    const playSound = useSounds();
    
    // --- Online Hook ---
    const {
        gameMode, onlineStep, playerName, roomId, playerSymbol, onlineGameState,
        isLoading, error, nameInputRef, roomInputRef,
        handleNameSubmit, handleEnterRoom, handleOnlineBack, handleRematch, changeGameMode,
    } = useOnlineGame('chess-games', createInitialOnlineState, reconstructOnlineState);

    // --- Memos and Callbacks ---
    const board = useMemo<Square[][]>(() => game.board().map((row: (Piece | null)[], r: number) => row.map((piece, f) => ({
        square: 'abcdefgh'[f] + (8 - r),
        piece
    }))), [game]);
    
    const kingInCheckSquare = useMemo(() => {
        if (!game.in_check()) return null;
        const kingPos = board.flat().find(s => s.piece?.type === 'k' && s.piece?.color === game.turn());
        return kingPos?.square;
    }, [game, board]);

    const isOnline = useMemo(() => gameMode === 'online', [gameMode]);
    const myTurn = useMemo(() => {
        if (!isOnline) return true;
        if (!playerSymbol || !onlineGameState) return false;
        const playerColor = playerSymbol === 'X' ? 'w' : 'b';
        return onlineGameState.currentPlayer === playerSymbol && game.turn() === playerColor;
    }, [isOnline, game, playerSymbol, onlineGameState]);
    
    // Sync local game state with online FEN
    useEffect(() => {
        if (isOnline && onlineGameState && game.fen() !== onlineGameState.fen) {
            const newGame = new ChessJS(onlineGameState.fen);
            setGame(newGame);
            const history = newGame.history({ verbose: true });
            const lastHistoryMove = history[history.length-1];
            if(lastHistoryMove?.captured) {
              playSound('back');
            } else if (history.length > 0) {
              playSound('place');
            }
        }
    }, [isOnline, onlineGameState, game, playSound]);

    // Update captured pieces whenever the board changes
    useEffect(() => {
        const initialPieces: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
        const currentPieces: Record<PieceColor, Record<string, number>> = { w: { ...initialPieces, k: 1 }, b: { ...initialPieces, k: 1 } };
        const captured: Record<PieceColor, Piece[]> = { w: [], b: [] };

        game.board().flat().forEach((p: Piece | null) => {
            if (p) currentPieces[p.color][p.type]--;
        });
        
        (['w', 'b'] as PieceColor[]).forEach(color => {
            for (const type in initialPieces) {
                for (let i = 0; i < currentPieces[color][type]; i++) {
                    captured[color === 'w' ? 'b' : 'w'].push({ type: type as PieceType, color });
                }
            }
        });

        const sortOrder: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
        captured.w.sort((a, b) => sortOrder.indexOf(a.type) - sortOrder.indexOf(b.type));
        captured.b.sort((a, b) => sortOrder.indexOf(a.type) - sortOrder.indexOf(b.type));

        setCapturedPieces(captured);
    }, [game]);
    
     useEffect(() => {
        if (isOnline && onlineGameState?.rematch.X && onlineGameState?.rematch.O) {
            const roomRef = db.ref(`chess-games/${roomId}`);
            const newGame = new ChessJS();
            roomRef.update({
                fen: newGame.fen(),
                lastMove: null,
                currentPlayer: 'X', // White always starts
                winner: null,
                rematch: { X: false, O: false },
                startingPlayer: onlineGameState.startingPlayer === 'X' ? 'O' : 'X', // Swap who is white
            });
        }
    }, [onlineGameState, isOnline, roomId]);


    const makeMove = useCallback((move: Move) => {
        const newGame = new ChessJS(game.fen());
        const result = newGame.move(move);

        if (result) {
            if (result.captured) playSound('back'); else playSound('place');
            if (newGame.in_check()) playSound('notify');
            if (newGame.game_over()) {
                if (newGame.in_checkmate()) playSound('win');
                else playSound('draw');
            }
            
            if (isOnline) {
                const updates: Partial<Pick<OnlineChessGameState, 'fen' | 'lastMove' | 'currentPlayer' | 'winner'>> = {
                    fen: newGame.fen(),
                    lastMove: { from: move.from, to: move.to },
                    currentPlayer: onlineGameState!.currentPlayer === 'X' ? 'O' : 'X'
                };
                if (newGame.game_over()) {
                    if (newGame.in_checkmate()) {
                        updates.winner = newGame.turn() === 'b' ? 'X' : 'O';
                    } else {
                        updates.winner = 'Draw';
                    }
                }
                db.ref(`chess-games/${roomId}`).update(updates);
            } else {
                setGame(newGame);
            }
        }
        
        setSelectedSquare(null);
        setPossibleMoves([]);
        setPromotionMove(null);
        return result;
    }, [game, isOnline, onlineGameState, roomId, playSound]);

    const handleSquareClick = useCallback((square: string) => {
        if (gameMode === 'online' && !myTurn) return;
        if (game.game_over()) return;

        const piece = game.get(square);

        if (selectedSquare) {
            if (square === selectedSquare) {
                setSelectedSquare(null);
                setPossibleMoves([]);
                return;
            }

            const move = { from: selectedSquare, to: square };
            const isValidMove = game.moves({ square: selectedSquare, verbose: true }).some((m: any) => m.to === square);

            if (isValidMove) {
                const pieceToMove = game.get(selectedSquare);
                if (pieceToMove.type === 'p' && ((pieceToMove.color === 'w' && selectedSquare[1] === '7' && square[1] === '8') || (pieceToMove.color === 'b' && selectedSquare[1] === '2' && square[1] === '1'))) {
                    setPromotionMove(move);
                } else {
                    makeMove(move);
                }
            } else {
                 if (piece && piece.color === game.turn()) {
                    playSound('select');
                    setSelectedSquare(square);
                    const moves = game.moves({ square, verbose: true }).map((m: any) => m.to);
                    setPossibleMoves(moves);
                } else {
                    setSelectedSquare(null);
                    setPossibleMoves([]);
                }
            }
        } else if (piece && piece.color === game.turn()) {
            playSound('select');
            setSelectedSquare(square);
            const moves = game.moves({ square, verbose: true }).map((m: any) => m.to);
            setPossibleMoves(moves);
        }
    }, [game, gameMode, myTurn, selectedSquare, makeMove, playSound]);
    
    const handlePromotion = (pieceType: PieceType) => {
        if (promotionMove) {
            makeMove({ ...promotionMove, promotion: pieceType });
        }
    };
    
    const resetLocalGame = () => {
        playSound('select');
        const newGame = new ChessJS();
        setGame(newGame);
        setSelectedSquare(null);
        setPossibleMoves([]);
        setPromotionMove(null);
    };
    
    // --- Render Functions ---
    const getStatusMessage = () => {
        if (game.game_over()) {
            if (game.in_checkmate()) return `Skakmat! ${game.turn() === 'w' ? 'Hitam' : 'Putih'} menang.`;
            if (game.in_draw()) return "Seri!";
            if (game.in_stalemate()) return "Stalemate!";
            if (game.in_threefold_repetition()) return "Seri karena pengulangan tiga kali!";
        }
        if (isOnline) {
            if (onlineGameState?.winner) {
                 if (onlineGameState.winner === 'Draw') return "Game Selesai: Seri!";
                 return `Game Selesai: ${onlineGameState.winner === playerSymbol ? 'Kamu menang!' : 'Kamu kalah!'}`;
            }
            return myTurn ? "Giliranmu" : `Menunggu ${onlineGameState?.players[onlineGameState.currentPlayer === 'X' ? 'O' : 'X']?.name || 'lawan'}`;
        }
        return `Giliran: ${game.turn() === 'w' ? 'Putih' : 'Hitam'}`;
    };

    const renderBoard = () => {
        const isFlipped = isOnline && playerSymbol === 'O';
        const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        if (isFlipped) {
            ranks.reverse();
            files.reverse();
        }

        const flatBoard = board.flat();
        if (isFlipped) {
            flatBoard.reverse();
        }

        return (
            <div className="board-layout-wrapper">
                 <div className="board-ranks">
                    {ranks.map(r => <div key={r}>{r}</div>)}
                </div>
                <div className="board-files">
                    {files.map(f => <div key={f}>{f}</div>)}
                </div>
                <div className="chess-board-grid">
                    {flatBoard.map((squareInfo) => {
                        const { square, piece } = squareInfo;
                        const rank = parseInt(square[1], 10) -1;
                        const file = square.charCodeAt(0) - 'a'.charCodeAt(0);

                        const isLight = (rank + file) % 2 !== 0;
                        const isSelected = square === selectedSquare;
                        const isPossible = possibleMoves.includes(square);
                        const lastHistoryMove = !isOnline && game.history({verbose:true}).length > 0 ? game.history({verbose:true}).slice(-1)[0] : null;
                        const isLastMove = (isOnline && (square === onlineGameState?.lastMove?.from || square === onlineGameState?.lastMove?.to)) ||
                                           (!isOnline && lastHistoryMove && (square === lastHistoryMove.from || square === lastHistoryMove.to));
                        const isCheck = square === kingInCheckSquare;

                        return (
                            <SquareComponent
                                key={square}
                                square={square}
                                piece={piece}
                                pieceOnSquare={game.get(square)}
                                isLight={isLight}
                                isSelected={isSelected}
                                isPossible={isPossible}
                                isLastMove={isLastMove}
                                isCheck={isCheck}
                                onClick={handleSquareClick}
                            />
                        );
                    })}
                </div>
            </div>
        );
    };

    const CapturedPiecesDisplay: React.FC<{ pieces: Piece[] }> = ({ pieces }) => (
      <div className="captured-pieces-container">
        {pieces.map((p, i) => (
            <span key={i} className={`captured-piece ${p.color === 'w' ? 'white' : 'black'}`}>
                {UNICODE_PIECES[p.color][p.type]}
            </span>
        ))}
      </div>
    );
    
    const PromotionChoice: React.FC<{ onPromote: (p: PieceType) => void, color: PieceColor }> = ({ onPromote, color }) => (
      <div className="promotion-overlay">
        <div className="promotion-box">
          {(['q', 'r', 'b', 'n'] as PieceType[]).map(p => (
            <div key={p} className="promotion-piece-choice" onClick={() => onPromote(p)}>
               <span className={`chess-piece large ${color === 'w' ? 'white' : 'black'}`}>
                 {UNICODE_PIECES[color][p]}
               </span>
            </div>
          ))}
        </div>
      </div>
    );

    const renderOnlineContent = () => {
        if (onlineStep === 'name' || onlineStep === 'room') {
            return <OnlineGameSetup {...{ onlineStep, playerName, nameInputRef, roomInputRef, handleNameSubmit, handleEnterRoom, isLoading, error }} />;
        }
        if (onlineStep === 'game') {
            if (!onlineGameState) return <div className="text-center"><div className="spinner-border text-info"></div><p className="mt-3">Memuat game...</p></div>;
            if (!onlineGameState.players.O) {
                return <div className="text-center"><h2 className="display-5 fw-bold text-white mb-3">Room: {roomId}</h2><p className="fs-5 text-muted">Bagikan nama room ini ke temanmu</p><div className="my-4 d-flex justify-content-center align-items-center gap-2"><div className="spinner-border text-warning" role="status"></div><p className="fs-4 text-warning m-0">Menunggu pemain lain...</p></div></div>;
            }
            
            const mySymbol = playerSymbol!;
            const opponentColor = mySymbol === 'X' ? 'b' : 'w';
            const myColor = mySymbol === 'X' ? 'w' : 'b';
            
            const rematchCount = (onlineGameState.rematch.X ? 1 : 0) + (onlineGameState.rematch.O ? 1 : 0);
            const amIReadyForRematch = playerSymbol && onlineGameState.rematch[playerSymbol];

            const PlayerInfo: React.FC<{symbol: Player, color: PieceColor}> = ({symbol, color}) => (
               <div className="w-100 p-2 bg-secondary rounded d-flex justify-content-between align-items-center">
                    <p className="m-0 fw-bold">{onlineGameState.players[symbol]?.name || '?'}</p>
                    <CapturedPiecesDisplay pieces={capturedPieces[color]} />
               </div>
            );

            const topPlayerSymbol = playerSymbol === 'X' ? 'O' : 'X';
            const bottomPlayerSymbol = playerSymbol!;

            return (
                <div className="d-flex flex-column align-items-center gap-3 w-100" style={{ maxWidth: '540px'}}>
                  {promotionMove && <PromotionChoice onPromote={handlePromotion} color={game.get(promotionMove.from)!.color} />}
                  <PlayerInfo symbol={topPlayerSymbol} color={myColor} />
                  {renderBoard()}
                  <PlayerInfo symbol={bottomPlayerSymbol} color={opponentColor} />
                  <p className={`mt-2 fs-5 fw-semibold ${game.game_over() || onlineGameState.winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p>
                  {onlineGameState.winner && <button onClick={handleRematch} disabled={!!amIReadyForRematch} className="btn btn-primary btn-lg">Rematch ({rematchCount}/2)</button>}
                </div>
            );
        }
        return null;
    };
    
    const renderContent = () => {
        switch (gameMode) {
            case 'menu':
                return <div className="text-center"><h2 className="display-5 fw-bold text-white mb-5">Catur</h2><div className="d-grid gap-3 col-sm-8 col-md-6 col-lg-4 mx-auto"><button onClick={() => changeGameMode('local')} className="btn btn-primary btn-lg">Mabar Lokal</button><button onClick={() => changeGameMode('online')} className="btn btn-info btn-lg">Mabar Online</button></div></div>;
            case 'local':
                return (
                    <div className="d-flex flex-column align-items-center gap-3 w-100" style={{ maxWidth: '540px'}}>
                        {promotionMove && <PromotionChoice onPromote={handlePromotion} color={game.get(promotionMove.from)!.color} />}
                        <div className="w-100 p-2 bg-secondary rounded d-flex justify-content-between align-items-center">
                          <p className="m-0 fw-bold text-start">Pion Hitam (Tertangkap)</p>
                          <CapturedPiecesDisplay pieces={capturedPieces.b} />
                        </div>
                        {renderBoard()}
                        <div className="w-100 p-2 bg-secondary rounded d-flex justify-content-between align-items-center">
                           <p className="m-0 fw-bold text-start">Pion Putih (Tertangkap)</p>
                           <CapturedPiecesDisplay pieces={capturedPieces.w} />
                        </div>
                        <p className={`mt-2 fs-5 fw-semibold ${game.game_over() ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p>
                        {game.game_over() && <button onClick={resetLocalGame} className="btn btn-primary btn-lg">Main Lagi</button>}
                    </div>
                );
            case 'online': return renderOnlineContent();
        }
    };

    return (
        <div className="d-flex flex-column align-items-center justify-content-center position-relative" style={{ minHeight: '80vh' }}>
            <BackButton onClick={gameMode === 'menu' ? onBack : () => gameMode === 'online' ? handleOnlineBack() : onBack()} />
            {renderContent()}
        </div>
    );
};

export default Chess;