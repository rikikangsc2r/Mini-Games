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
import ChatAndEmotePanel from './ChatAndEmotePanel';
import InGameMessageDisplay from './InGameMessageDisplay';
import OnlineGameWrapper from './OnlineGameWrapper';

// --- Global Declarations & Helpers ---
declare const firebase: any;
declare const Chess: any;
type ChessInstance = any;
const db = firebase.database();

interface OnlineGameState extends BaseOnlineGameState {
    fen: string;
    lastMove: { from: string; to: string } | null;
    players: {
        X: OnlinePlayer | null;
        O: OnlinePlayer | null;
    };
}
type PieceStyle = 'unicode' | 'fa';
type Piece = { type: string, color: 'b' | 'w' };
type Square = string;

// --- Game State Creation ---
const createInitialOnlineState = (playerName: string, deviceId: string, avatarUrl: string): OnlineGameState => ({
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    lastMove: null,
    currentPlayer: 'X', // 'X' is always white in chess
    winner: null,
    players: { X: { deviceId, name: playerName, avatarUrl }, O: null },
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    rematch: { X: false, O: false },
    startingPlayer: 'X',
    chatMessages: [],
});

const getRematchState = (): Partial<OnlineGameState> => ({
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    lastMove: null,
    chatMessages: [],
});


const reconstructOnlineState = (gameData: any): OnlineGameState => ({
    ...gameData,
    players: gameData.players || { X: null, O: null },
    rematch: gameData.rematch || { X: false, O: false },
    chatMessages: gameData.chatMessages || [],
});


// --- Helper Components & Functions ---
const UNICODE_PIECES: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟', K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' };
const FA_PIECES: Record<string, string> = { k: 'fas fa-chess-king', q: 'fas fa-chess-queen', r: 'fas fa-chess-rook', b: 'fas fa-chess-bishop', n: 'fas fa-chess-knight', p: 'fas fa-chess-pawn', K: 'fas fa-chess-king', Q: 'fas fa-chess-queen', R: 'fas fa-chess-rook', B: 'fas fa-chess-bishop', N: 'fas fa-chess-knight', P: 'fas fa-chess-pawn' };

const getPieceData = (piece: Piece, pieceStyle: PieceStyle) => {
    const key = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
    if (pieceStyle === 'unicode') return { content: UNICODE_PIECES[key], className: '' };
    return { content: '', className: FA_PIECES[key] };
};

const PieceComponent: React.FC<{ piece: Piece; pieceStyle: PieceStyle }> = ({ piece, pieceStyle }) => {
    const { content, className } = getPieceData(piece, pieceStyle);
    const colorClass = piece.color === 'w' ? 'white' : 'black';
    return <span className={`chess-piece ${colorClass} ${className} ${pieceStyle === 'fa' ? 'fa-piece' : ''}`}>{content}</span>;
};

const CapturedPiecesDisplay: React.FC<{ pieces: Piece[] }> = ({ pieces }) => (
    <div className="captured-pieces-container">
        {pieces.map((p, i) => (
            <span key={i} className={`captured-piece ${p.color === 'w' ? 'white' : 'black'}`}>
                {UNICODE_PIECES[p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase()]}
            </span>
        ))}
    </div>
);

const ChessPlayerBar: React.FC<{ player: OnlinePlayer | null; capturedPieces: Piece[]; isMyTurn: boolean; }> = ({ player, capturedPieces, isMyTurn }) => {
    return (
        <div className={`chess-player-bar d-flex align-items-center justify-content-between w-100 p-2 rounded ${isMyTurn ? 'bg-success bg-opacity-25' : ''}`} style={{maxWidth: 'clamp(320px, 90vw, 700px)', transition: 'background-color 0.3s ease'}}>
            <PlayerDisplay player={player} />
            <CapturedPiecesDisplay pieces={capturedPieces} />
        </div>
    );
};

const getCapturedPieces = (game: ChessInstance): { capturedByWhite: Piece[], capturedByBlack: Piece[] } => {
    const capturedByWhite: Piece[] = [];
    const capturedByBlack: Piece[] = [];
    
    game.history({ verbose: true }).forEach((move: any) => {
        if (move.captured) {
            // FIX: Explicitly type `piece` as `Piece` to ensure `color` is typed as 'b' | 'w' instead of string.
            const piece: Piece = {
                type: move.captured,
                color: move.color === 'w' ? 'b' : 'w' // The captured piece is the opposite color of the mover
            };
            if (move.color === 'w') {
                capturedByWhite.push(piece);
            } else {
                capturedByBlack.push(piece);
            }
        }
    });
    
    return { capturedByWhite, capturedByBlack };
};


interface ChessProps {
    onBackToMenu: () => void;
    description: string;
}

const ChessGame: React.FC<ChessProps> = ({ onBackToMenu, description }) => {
    const playSound = useSounds();
    const {
        gameMode, onlineStep, playerProfile, roomId, playerSymbol, onlineGameState, isLoading, error,
        roomInputRef, handleProfileSubmit, handleEnterRoom, handleRematch: handleOnlineRematch, changeGameMode,
        handleChangeProfileRequest, sendChatMessage,
    } = useOnlineGame('chess-games', createInitialOnlineState, reconstructOnlineState, getRematchState, onBackToMenu);
    
    // --- State ---
    const [game, setGame] = useState<ChessInstance>(new Chess());
    const [fen, setFen] = useState(game.fen());
    const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
    const [lastMoveHighlight, setLastMoveHighlight] = useState<{ from: Square; to: Square } | null>(null);
    const [kingInCheck, setKingInCheck] = useState<Square | null>(null);
    const [pieceStyle, setPieceStyle] = useState<PieceStyle>('unicode');
    const [promotionChoice, setPromotionChoice] = useState<{ from: Square; to: Square; color: 'w' | 'b' } | null>(null);
    const [winner, setWinner] = useState<string | null>(null);
    const [aiPlayerColor, setAiPlayerColor] = useState<'w' | 'b' | null>(null);
    const [isAiThinking, setIsAiThinking] = useState(false);
    const [showRules, setShowRules] = useState(false);

    // --- Memos and Refs ---
    const boardFlipped = useMemo(() => {
        if (gameMode === 'online') return playerSymbol === 'O';
        if (gameMode === 'ai') return aiPlayerColor === 'w';
        return false;
    }, [gameMode, playerSymbol, aiPlayerColor]);

    const possibleMoves = useMemo(() => {
        if (!selectedSquare) return [];
        const moves = game.moves({ square: selectedSquare, verbose: true });
        return moves.map((move: any) => move.to);
    }, [selectedSquare, game]);
    
    const prevOnlineFen = useRef<string | null>(null);
    const isFetchingAiMove = useRef(false);

    // --- Effects ---
    useEffect(() => {
        const storedStyle = localStorage.getItem('chessPieceStyle') as PieceStyle;
        if (storedStyle === 'unicode' || storedStyle === 'fa') {
            setPieceStyle(storedStyle);
        }
    }, []);
    
    useEffect(() => {
        if (gameMode === 'menu') {
            const newGame = new Chess();
            setGame(newGame);
            setFen(newGame.fen());
            setWinner(null);
            setSelectedSquare(null);
            setLastMoveHighlight(null);
            setKingInCheck(null);
            setPromotionChoice(null);
        }
    }, [gameMode]);
    
    useEffect(() => {
        const findKing = (color: 'w' | 'b'): Square | null => {
            for (let r = 1; r <= 8; r++) {
                for (const f of 'abcdefgh') {
                    const square = `${f}${r}`;
                    const piece = game.get(square);
                    if (piece && piece.type === 'k' && piece.color === color) {
                        return square;
                    }
                }
            }
            return null;
        };
        const currentKingPos = findKing(game.turn());
        setKingInCheck(game.in_check() ? currentKingPos : null);
    }, [fen, game]);

    // --- Core Game Logic ---
    const updateGameStatus = useCallback((currentGame: ChessInstance): boolean => {
        if (currentGame.game_over()) {
            if (currentGame.in_checkmate()) {
                setWinner(currentGame.turn() === 'w' ? 'Black' : 'White');
                playSound('win');
            } else if (currentGame.in_draw() || currentGame.in_stalemate() || currentGame.in_threefold_repetition()) {
                setWinner('Draw');
                playSound('draw');
            }
            return true;
        } else {
            setWinner(null);
            return false;
        }
    }, [playSound]);

    const fetchAiMove = useCallback(async (currentFen: string) => {
        if (isFetchingAiMove.current) return;
        isFetchingAiMove.current = true;
        setIsAiThinking(true);
        try {
            const response = await fetch('https://nirkyy-stockfish.hf.space/bestmove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fen: currentFen })
            });

            if (!response.ok) {
                throw new Error(`Stockfish API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const bestmoveUci = data.bestmove;

            if (bestmoveUci && typeof bestmoveUci === 'string' && bestmoveUci.length >= 4) {
                const from = bestmoveUci.substring(0, 2);
                const to = bestmoveUci.substring(2, 4);
                const promotion = bestmoveUci.length > 4 ? bestmoveUci.substring(4) : undefined;
                
                setGame(currentGame => {
                    const gameCopy = new Chess(currentGame.fen());
                    const moveResult = gameCopy.move({ from, to, promotion });

                    if (moveResult) {
                         setFen(gameCopy.fen());
                         setLastMoveHighlight({ from, to });
                         // FIX: Moved `updateGameStatus` before `fetchAiMove` to resolve block-scoped variable error.
                         updateGameStatus(gameCopy);

                         if (!gameCopy.game_over()) {
                            if (gameCopy.in_check()) {
                                playSound('check');
                            } else if (moveResult.flags.includes('c') || moveResult.flags.includes('e')) {
                                playSound('capture');
                            } else {
                                playSound('place');
                            }
                         }
                    }
                    return gameCopy;
                });

            } else {
                 throw new Error("Invalid bestmove received from API.");
            }
        } catch (e) {
            console.error("Gagal mengambil gerakan AI:", e);
        } finally {
            setIsAiThinking(false);
            isFetchingAiMove.current = false;
        }
    }, [playSound, updateGameStatus]);
    
    const performMove = useCallback((move: { from: Square; to: Square; promotion?: string }) => {
        const gameCopy = new Chess(fen);
        const moveResult = gameCopy.move(move);
    
        if (!moveResult) return false;
    
        setGame(gameCopy);
        setFen(gameCopy.fen());
        setLastMoveHighlight({ from: move.from, to: move.to });
        setSelectedSquare(null);
    
        const isGameOver = updateGameStatus(gameCopy);
        
        if (!isGameOver) {
            if (gameCopy.in_check()) {
                playSound('check');
            } else if (moveResult.flags.includes('c') || moveResult.flags.includes('e')) {
                playSound('capture');
            } else {
                playSound('place');
            }
        }
        
        if (gameMode === 'online' && playerSymbol) {
            const opponentSymbol = playerSymbol === 'X' ? 'O' : 'X';
            const updatePayload: Partial<OnlineGameState> = {
                fen: gameCopy.fen(),
                lastMove: { from: move.from, to: move.to },
                currentPlayer: opponentSymbol,
            };
            if (gameCopy.game_over()) {
                if (gameCopy.in_checkmate()) updatePayload.winner = playerSymbol;
                else updatePayload.winner = 'Draw';
            }
            db.ref(`chess-games/${roomId}`).update(updatePayload);
        } else if (gameMode === 'ai' && !gameCopy.game_over() && gameCopy.turn() === aiPlayerColor) {
            setTimeout(() => fetchAiMove(gameCopy.fen()), 500);
        }
    
        return true;
    }, [fen, gameMode, playerSymbol, aiPlayerColor, playSound, updateGameStatus, roomId, fetchAiMove]);

    const handleSquareClick = (square: Square) => {
        if (winner || (gameMode === 'ai' && game.turn() === aiPlayerColor) || isAiThinking) return;

        const pieceOnSquare = game.get(square);

        if (selectedSquare) {
            if (square === selectedSquare) {
                setSelectedSquare(null);
                return;
            }
            
            const piece = game.get(selectedSquare);
            let isPromotion = false;
            if (piece && piece.type === 'p') {
                const fromRank = selectedSquare.charAt(1);
                const toRank = square.charAt(1);
                isPromotion = (piece.color === 'w' && fromRank === '7' && toRank === '8') ||
                              (piece.color === 'b' && fromRank === '2' && toRank === '1');
            }

            if (isPromotion) {
                setPromotionChoice({ from: selectedSquare, to: square, color: game.turn() });
                setSelectedSquare(null);
            } else {
                const moveSuccessful = performMove({ from: selectedSquare, to: square });
                if (!moveSuccessful && pieceOnSquare && pieceOnSquare.color === game.turn()) {
                    setSelectedSquare(square);
                } else if (!moveSuccessful) {
                    setSelectedSquare(null);
                }
            }
        } else if (pieceOnSquare && pieceOnSquare.color === game.turn()) {
            const myColor = gameMode === 'online' ? (playerSymbol === 'X' ? 'w' : 'b') : (aiPlayerColor === 'w' ? 'b' : 'w');
            if ((gameMode === 'ai' || gameMode === 'online') && game.turn() !== myColor) return;
            
            playSound('select');
            setSelectedSquare(square);
        }
    };
    
    const handlePromotionSelect = (piece: string) => {
        if (!promotionChoice) return;
        performMove({ from: promotionChoice.from, to: promotionChoice.to, promotion: piece });
        setPromotionChoice(null);
    };

    useEffect(() => {
        if (gameMode === 'online' && onlineGameState && onlineGameState.fen !== prevOnlineFen.current && onlineGameState.fen !== fen) {
            prevOnlineFen.current = onlineGameState.fen;
    
            const newGame = new Chess(onlineGameState.fen);
    
            // Play sound based on the new state provided by the opponent
            if (onlineGameState.lastMove && !newGame.game_over()) {
                if (newGame.in_check()) {
                    playSound('check');
                } else {
                    // To detect a capture, inspect the last move in the game's history.
                    const history = newGame.history({ verbose: true });
                    const lastHistoryMove = history[history.length - 1];
                    if (lastHistoryMove && (lastHistoryMove.flags.includes('c') || lastHistoryMove.flags.includes('e'))) {
                        playSound('capture');
                    } else {
                        playSound('place');
                    }
                }
            }
    
            setGame(newGame);
            setFen(newGame.fen());
            setLastMoveHighlight(onlineGameState.lastMove);
            updateGameStatus(newGame);
        }
    }, [onlineGameState, gameMode, fen, playSound, updateGameStatus]);

    const resetGame = (playerColor?: 'w' | 'b') => {
        const newGame = new Chess();
        setGame(newGame);
        setFen(newGame.fen());
        setWinner(null);
        setSelectedSquare(null);
        setLastMoveHighlight(null);
        if (gameMode === 'ai') {
            const aiColor = playerColor === 'w' ? 'b' : 'w';
            setAiPlayerColor(aiColor);
            if (aiColor === 'w') {
                setTimeout(() => fetchAiMove(newGame.fen()), 500);
            }
        }
    };

    const handleAiRematch = () => {
        playSound('select');
        resetGame(aiPlayerColor === 'w' ? 'b' : 'w');
    };

    const renderBoard = () => {
        const board = [];
        const ranks = boardFlipped ? '12345678' : '87654321';
        const files = boardFlipped ? 'hgfedcba' : 'abcdefgh';

        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const squareName = `${files[f]}${ranks[r]}`;
                const piece = game.get(squareName);
                const isLight = (r + f) % 2 !== 0;

                board.push(
                    <div
                        key={squareName}
                        className={`chess-square ${isLight ? 'light' : 'dark'} ${selectedSquare === squareName ? 'selected' : ''}`}
                        onClick={() => handleSquareClick(squareName)}
                    >
                        {lastMoveHighlight?.from === squareName && <div className="square-overlay highlight-move" />}
                        {lastMoveHighlight?.to === squareName && <div className="square-overlay highlight-move" />}
                        {kingInCheck === squareName && <div className="square-overlay check" />}
                        
                        {piece && (
                            <div className="chess-piece-container">
                                <PieceComponent piece={piece} pieceStyle={pieceStyle} />
                            </div>
                        )}

                        {possibleMoves.includes(squareName) && (
                            <div className="square-overlay possible-move">
                                {game.get(squareName) ? <div className="capture-ring" /> : <div className="move-dot" />}
                            </div>
                        )}
                    </div>
                );
            }
        }
        return board;
    };

    const getStatusMessage = () => {
        if (winner) return winner === 'Draw' ? 'Hasilnya Seri!' : `Pemain ${winner} Menang!`;
        if (gameMode === 'ai') {
            if (isAiThinking) return 'AI sedang berpikir...';
            return game.turn() === aiPlayerColor ? 'Giliran AI' : 'Giliranmu';
        }
        if (gameMode === 'online' && onlineGameState && playerSymbol) {
            const myColor = playerSymbol === 'X' ? 'w' : 'b';
            if (game.turn() === myColor) return 'Giliranmu';
            return `Menunggu ${onlineGameState.players[playerSymbol === 'X' ? 'O' : 'X']?.name || 'Lawan'}`;
        }
        return `Giliran ${game.turn() === 'w' ? 'Putih' : 'Hitam'}`;
    };
    
    const renderOnlineContent = () => {
        if (onlineStep !== 'game') return <OnlineGameSetup {...{ onlineStep, playerProfile, roomInputRef, handleProfileSubmit, handleEnterRoom, isLoading, error, handleChangeProfileRequest }} />;
        if (!onlineGameState) return <div className="text-center"><div className="spinner-border text-info"></div><p className="mt-3">Memuat game...</p></div>;
        if (!onlineGameState.players.O) return <GameLobby roomId={roomId} />;

        const mySymbol = playerSymbol!;
        const opponentSymbol = mySymbol === 'X' ? 'O' : 'X';
        const myColor = mySymbol === 'X' ? 'w' : 'b';
        const opponentColor = opponentSymbol === 'X' ? 'w' : 'b';

        const { capturedByWhite, capturedByBlack } = getCapturedPieces(game);
        const myCaptured = myColor === 'w' ? capturedByBlack : capturedByWhite;
        const opponentCaptured = opponentColor === 'w' ? capturedByBlack : capturedByWhite;

        const isMyTurn = !winner && game.turn() === myColor;

        return (
            <OnlineGameWrapper
                myPlayer={onlineGameState.players[mySymbol]}
                opponent={onlineGameState.players[opponentSymbol]}
                mySymbol={mySymbol}
                roomId={roomId}
                statusMessage={getStatusMessage()}
                isMyTurn={isMyTurn}
                isGameOver={!!onlineGameState.winner || !!winner}
                rematchCount={(onlineGameState.rematch.X ? 1 : 0) + (onlineGameState.rematch.O ? 1 : 0)}
                amIReadyForRematch={!!(playerSymbol && onlineGameState.rematch[playerSymbol])}
                onRematch={handleOnlineRematch}
                chatMessages={onlineGameState.chatMessages}
                onSendMessage={sendChatMessage}
                opponentSideContent={<ChessPlayerBar player={onlineGameState.players[opponentSymbol]} capturedPieces={opponentCaptured} isMyTurn={game.turn() === opponentColor && !winner} />}
                mySideContent={<ChessPlayerBar player={onlineGameState.players[mySymbol]} capturedPieces={myCaptured} isMyTurn={game.turn() === myColor && !winner} />}
            >
                <div className="board-layout-wrapper">
                    <div className="board-ranks">{[... (boardFlipped ? '12345678' : '87654321')].map(r => <span key={r}>{r}</span>)}</div>
                    <div className="board-files">{[... (boardFlipped ? 'hgfedcba' : 'abcdefgh')].map(f => <span key={f}>{f}</span>)}</div>
                    <div className="chess-board-grid">
                        {renderBoard()}
                        {promotionChoice && (
                            <div className="promotion-overlay">
                                <div className="promotion-box">
                                    {['q', 'r', 'b', 'n'].map(p_type => (
                                        <div key={p_type} className="promotion-piece-choice" onClick={() => handlePromotionSelect(p_type)}>
                                            <PieceComponent piece={{ type: p_type, color: promotionChoice.color }} pieceStyle={pieceStyle} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                 </div>
            </OnlineGameWrapper>
        );
    };
    
    const renderContent = () => {
        if (gameMode === 'ai' && !aiPlayerColor) {
            return (
                <div className="text-center">
                    <h3 className="mb-4">Pilih Warnamu</h3>
                    <div className="d-grid gap-3 col-6 mx-auto">
                        <button onClick={() => resetGame('w')} className="btn btn-light btn-lg">Putih</button>
                        <button onClick={() => resetGame('b')} className="btn btn-dark btn-lg">Hitam</button>
                    </div>
                </div>
            );
        }

        if (gameMode === 'online') {
            return renderOnlineContent();
        }
        
        return (
            <div className="d-flex flex-column align-items-center">
                 <p className="fs-4 fw-semibold mb-3">{getStatusMessage()}</p>
                 <div className="board-layout-wrapper">
                    <div className="board-ranks">{[... (boardFlipped ? '12345678' : '87654321')].map(r => <span key={r}>{r}</span>)}</div>
                    <div className="board-files">{[... (boardFlipped ? 'hgfedcba' : 'abcdefgh')].map(f => <span key={f}>{f}</span>)}</div>
                    <div className="chess-board-grid">
                        {renderBoard()}
                        {promotionChoice && (
                            <div className="promotion-overlay">
                                <div className="promotion-box">
                                    {['q', 'r', 'b', 'n'].map(p_type => (
                                        <div key={p_type} className="promotion-piece-choice" onClick={() => handlePromotionSelect(p_type)}>
                                            <PieceComponent piece={{ type: p_type, color: promotionChoice.color }} pieceStyle={pieceStyle} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                 </div>
                 <div className="d-flex justify-content-center align-items-center gap-4 mt-3">
                    {winner && <button onClick={gameMode === 'ai' ? handleAiRematch : () => resetGame()} className="btn btn-primary">Main Lagi</button>}
                    <div className="btn-group">
                        <button className={`btn btn-sm ${pieceStyle === 'unicode' ? 'btn-info' : 'btn-outline-info'}`} onClick={() => { setPieceStyle('unicode'); localStorage.setItem('chessPieceStyle', 'unicode'); }}>Aa</button>
                        <button className={`btn btn-sm ${pieceStyle === 'fa' ? 'btn-info' : 'btn-outline-info'}`} onClick={() => { setPieceStyle('fa'); localStorage.setItem('chessPieceStyle', 'fa'); }}><i className="fas fa-chess-knight"></i></button>
                    </div>
                 </div>
            </div>
        );
    };

    return (
        <div className="d-flex flex-column align-items-center justify-content-center position-relative" style={{ minHeight: '80vh' }}>
            <BackButton onClick={gameMode === 'menu' ? onBackToMenu : () => { changeGameMode('menu'); setAiPlayerColor(null); }} />
            <div className="text-center mb-4">
                {gameMode !== 'menu' && (
                    <div className="d-flex justify-content-center align-items-center gap-3">
                        <h2 className="display-5 fw-bold text-white mb-0">Catur</h2>
                        <button onClick={() => setShowRules(true)} className="btn btn-sm btn-outline-secondary">Aturan</button>
                    </div>
                )}
            </div>
            {gameMode === 'menu' ? <GameModeSelector title="Catur" description={description} changeGameMode={changeGameMode} /> : renderContent()}
            <RulesModal title="Aturan Catur" show={showRules} onClose={() => setShowRules(false)}>
              <p>Tujuan dari permainan ini adalah untuk melakukan sekakmat pada raja lawan. Sekakmat terjadi ketika raja berada dalam posisi untuk ditangkap (dalam 'sekak') dan tidak ada cara untuk menghindar dari penangkapan.</p>
            </RulesModal>
        </div>
    );
};

export default ChessGame;