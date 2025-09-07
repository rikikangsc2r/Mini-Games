import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import BackButton from './BackButton';
import useSounds from './useSounds';
import { useOnlineGame, BaseOnlineGameState, OnlinePlayer } from '../hooks/useOnlineGame';
import OnlineGameSetup from './OnlineGameSetup';
import type { Player } from '../types';
import RulesModal from './RulesModal';
import PlayerDisplay from './PlayerDisplay';
import GameLobby from './GameLobby';
import GameModeSelector from './GameModeSelector';

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
    players: {
        X: OnlinePlayer | null;
        O: OnlinePlayer | null;
    };
}

// --- Helper Functions ---
const createInitialOnlineState = (playerName: string, deviceId: string, avatarUrl: string): OnlineChessGameState => ({
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    lastMove: null,
    currentPlayer: 'X', // 'X' is always white
    winner: null,
    players: { X: { deviceId, name: playerName, avatarUrl }, O: null },
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    rematch: { X: false, O: false },
    startingPlayer: 'X',
});

const getRematchState = (): Partial<OnlineChessGameState> => ({
    fen: new ChessJS().fen(),
    lastMove: null,
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

// --- Custom Hook ---
function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T | undefined>(undefined);
    useEffect(() => {
        ref.current = value;
    }, [value]);
    return ref.current;
}

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

interface ChessProps {
  onBackToMenu: () => void;
}

const Chess: React.FC<ChessProps> = ({ onBackToMenu }) => {
    // --- State ---
    const [game, setGame] = useState(() => new ChessJS());
    const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
    const [promotionMove, setPromotionMove] = useState<Move | null>(null);
    const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
    const [capturedPieces, setCapturedPieces] = useState<Record<PieceColor, Piece[]>>({ w: [], b: [] });
    const playSound = useSounds();
    const [showRules, setShowRules] = useState(false);
    
    // --- Online Hook ---
    const {
        gameMode, onlineStep, playerProfile, roomId, playerSymbol, onlineGameState,
        isLoading, error, roomInputRef,
        handleProfileSubmit, handleEnterRoom, handleRematch, changeGameMode,
        handleChangeProfileRequest,
    } = useOnlineGame('chess-games', createInitialOnlineState, reconstructOnlineState, getRematchState, onBackToMenu);
    
    const prevOnlineGameState = usePrevious(onlineGameState);

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

    const { myColor, isFlipped, myTurn } = useMemo(() => {
        const isOnline = gameMode === 'online';
        if (!isOnline || !onlineGameState || !playerSymbol) {
            return { myColor: game.turn(), isFlipped: false, myTurn: !game.game_over() };
        }

        const whitePlayerSymbol = onlineGameState.startingPlayer;
        const isWhiteForMe = playerSymbol === whitePlayerSymbol;
        const myColorForThisGame = isWhiteForMe ? 'w' : 'b';
        const boardIsFlipped = !isWhiteForMe;
        const currentTurnColor = game.turn();
        const isMyTurn = (currentTurnColor === myColorForThisGame) && !game.game_over() && !!onlineGameState.players.O;

        return { myColor: myColorForThisGame, isFlipped: boardIsFlipped, myTurn: isMyTurn };
    }, [gameMode, onlineGameState, playerSymbol, game]);
    
    // Sync game state from Firebase and play sounds for opponent's moves
    useEffect(() => {
        if (gameMode !== 'online' || !onlineGameState) return;

        if (!prevOnlineGameState) {
            setGame(new ChessJS(onlineGameState.fen));
            return;
        }

        if (onlineGameState.fen !== prevOnlineGameState.fen) {
            const newGame = new ChessJS(onlineGameState.fen);
            setGame(newGame);

            const isOpponentMove = newGame.turn() === myColor;

            if (isOpponentMove && onlineGameState.lastMove) {
                const oldGame = new ChessJS(prevOnlineGameState.fen);
                const wasCapture = !!oldGame.get(onlineGameState.lastMove.to);
                
                if (wasCapture) playSound('back'); else playSound('place');
                if (newGame.in_check()) playSound('notify');
            }
        }
    }, [gameMode, onlineGameState, prevOnlineGameState, myColor, playSound]);

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
            
            if (gameMode === 'online') {
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
    }, [game, gameMode, onlineGameState, roomId, playSound]);

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
        if (gameMode === 'online' && onlineGameState) {
            if (onlineGameState.winner) {
                 if (onlineGameState.winner === 'Draw') return "Game Selesai: Seri!";
                 const winnerName = onlineGameState.players[onlineGameState.winner as Player]?.name;
                 return `Game Selesai: ${onlineGameState.winner === playerSymbol ? 'Kamu menang!' : `${winnerName || 'Lawan'} menang!`}`;
            }
            return myTurn ? "Giliranmu" : `Menunggu ${onlineGameState.players[onlineGameState.currentPlayer]?.name || 'lawan'}`;
        }
        return `Giliran: ${game.turn() === 'w' ? 'Putih' : 'Hitam'}`;
    };

    const renderBoard = () => {
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
                        const lastHistoryMove = gameMode !== 'online' && game.history({verbose:true}).length > 0 ? game.history({verbose:true}).slice(-1)[0] : null;
                        const isLastMove = (gameMode === 'online' && (square === onlineGameState?.lastMove?.from || square === onlineGameState?.lastMove?.to)) ||
                                           (gameMode !== 'online' && lastHistoryMove && (square === lastHistoryMove.from || square === lastHistoryMove.to));
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
        if (onlineStep !== 'game') {
            return <OnlineGameSetup {...{ onlineStep, playerProfile, roomInputRef, handleProfileSubmit, handleEnterRoom, isLoading, error, handleChangeProfileRequest }} />;
        }
        if (!onlineGameState) return <div className="text-center"><div className="spinner-border text-info"></div><p className="mt-3">Memuat game...</p></div>;
        if (!onlineGameState.players.O) return <GameLobby roomId={roomId} />;
        
        const rematchCount = (onlineGameState.rematch.X ? 1 : 0) + (onlineGameState.rematch.O ? 1 : 0);
        const amIReadyForRematch = playerSymbol && onlineGameState.rematch[playerSymbol];

        const PlayerInfoBar: React.FC<{playerData: OnlinePlayer | null, capturedColor: PieceColor}> = ({playerData, capturedColor}) => (
           <div className="w-100 p-2 bg-secondary rounded d-flex justify-content-between align-items-center">
                <PlayerDisplay player={playerData} />
                <CapturedPiecesDisplay pieces={capturedPieces[capturedColor]} />
           </div>
        );

        const opponentSymbol = playerSymbol === 'X' ? 'O' : 'X';
        const topPlayerCapturedColor = myColor;
        const bottomPlayerCapturedColor = myColor === 'w' ? 'b' : 'w';

        return (
            <div className="d-flex flex-column align-items-center gap-3 w-100" style={{ maxWidth: '540px'}}>
              {promotionMove && <PromotionChoice onPromote={handlePromotion} color={game.get(promotionMove.from)!.color} />}
              <PlayerInfoBar playerData={onlineGameState.players[opponentSymbol]} capturedColor={topPlayerCapturedColor} />
              {renderBoard()}
              <PlayerInfoBar playerData={onlineGameState.players[playerSymbol!]} capturedColor={bottomPlayerCapturedColor} />
              <p className={`mt-2 fs-5 fw-semibold ${game.game_over() || onlineGameState.winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p>
              {onlineGameState.winner && <button onClick={handleRematch} disabled={!!amIReadyForRematch} className="btn btn-primary btn-lg">Rematch ({rematchCount}/2)</button>}
            </div>
        );
    };
    
    const renderContent = () => {
        switch (gameMode) {
            case 'menu':
                return <GameModeSelector title="Catur" changeGameMode={changeGameMode} />;
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
            <BackButton onClick={gameMode === 'menu' ? onBackToMenu : () => changeGameMode('menu')} />
            
            {gameMode !== 'menu' && (
                <div className="text-center mb-4">
                    <div className="d-flex justify-content-center align-items-center gap-3">
                        <h2 className="display-5 fw-bold text-white mb-0">Catur</h2>
                        <button onClick={() => setShowRules(true)} className="btn btn-sm btn-outline-secondary" aria-label="Tampilkan Aturan">Aturan</button>
                    </div>
                </div>
            )}

            {renderContent()}

            <RulesModal title="Aturan Dasar Catur" show={showRules} onClose={() => setShowRules(false)}>
                <p>Tujuan utama catur adalah untuk melakukan sekakmat (checkmate) terhadap raja lawan.</p>
                <ul className="list-unstyled ps-3">
                    <li><strong>- Sekakmat:</strong> Situasi di mana raja lawan sedang diserang (dalam keadaan 'sekak') dan tidak bisa melarikan diri dari serangan tersebut.</li>
                    <li><strong>- Setiap bidak memiliki cara bergerak yang unik:</strong>
                        <ul className="list-unstyled ps-4">
                            <li><strong>Raja (King):</strong> Bergerak satu kotak ke segala arah.</li>
                            <li><strong>Ratu (Queen):</strong> Bergerak lurus ke segala arah (horizontal, vertikal, diagonal) dengan jarak tak terbatas.</li>
                            <li><strong>Benteng (Rook):</strong> Bergerak lurus secara horizontal atau vertikal dengan jarak tak terbatas.</li>
                            <li><strong>Gajah (Bishop):</strong> Bergerak lurus secara diagonal dengan jarak tak terbatas.</li>
                            <li><strong>Kuda (Knight):</strong> Bergerak dalam bentuk "L" (dua kotak lurus, lalu satu kotak ke samping). Kuda adalah satu-satunya bidak yang bisa melompati bidak lain.</li>
                            <li><strong>Pion (Pawn):</strong> Bergerak maju satu kotak. Pada langkah pertamanya, pion bisa maju dua kotak. Pion memakan bidak lawan secara diagonal satu kotak ke depan.</li>
                        </ul>
                    </li>
                    <li><strong>- Promosi:</strong> Jika pion berhasil mencapai baris terakhir papan, pion dapat dipromosikan menjadi Ratu, Benteng, Gajah, atau Kuda.</li>
                    <li><strong>- Seri (Draw):</strong> Permainan bisa berakhir seri dalam beberapa kondisi, seperti stalemate (raja tidak dalam sekak tapi tidak bisa bergerak), atau pengulangan posisi tiga kali.</li>
                </ul>
            </RulesModal>
        </div>
    );
};

export default Chess;
