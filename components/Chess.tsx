import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
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
    const [moveFrom, setMoveFrom] = useState<Square | ''>('');
    const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
    const [lastMoveHighlight, setLastMoveHighlight] = useState<{ from: Square; to: Square } | null>(null);
    const [kingInCheck, setKingInCheck] = useState<Square | null>(null);
    const [winner, setWinner] = useState<string | null>(null);
    const [aiPlayerColor, setAiPlayerColor] = useState<'w' | 'b' | null>(null);
    const [isAiThinking, setIsAiThinking] = useState(false);
    const [showRules, setShowRules] = useState(false);

    // --- Memos and Refs ---
    const boardFlipped = useMemo(() => {
        if (gameMode === 'online') return playerSymbol === 'O';
        // Balik papan jika pemain bermain sebagai hitam (yaitu, AI berwarna putih)
        if (gameMode === 'ai') return aiPlayerColor === 'w';
        return false;
    }, [gameMode, playerSymbol, aiPlayerColor]);
    
    const isFetchingAiMove = useRef(false);
    const moveForPromotion = useRef<{ from: Square; to: Square } | null>(null);
    const makeMoveRef = useRef<((move: { from: Square; to: Square; promotion?: string }, isOpponentMove?: boolean) => boolean) | null>(null);


    // --- Effects ---
    useEffect(() => {
        if (gameMode === 'menu') {
            const newGame = new Chess();
            setGame(newGame);
            setWinner(null);
            setLastMoveHighlight(null);
            setKingInCheck(null);
            setMoveFrom('');
            setPossibleMoves([]);
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
    }, [game]);

    // --- Core Game Logic ---
    const updateGameStatus = useCallback((currentGame: ChessInstance): boolean => {
        if (currentGame.game_over()) {
            if (currentGame.in_checkmate()) {
                setWinner(currentGame.turn() === 'w' ? 'Black' : 'White');
                playSound('chess-move-check');
                setTimeout(() => playSound('chess-game-end'), 400);
            } else if (currentGame.in_draw() || currentGame.in_stalemate() || currentGame.in_threefold_repetition()) {
                setWinner('Draw');
                playSound('chess-game-end');
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
            if (!response.ok) throw new Error(`Stockfish API error: ${response.status}`);
            const data = await response.json();
            const bestmoveUci = data.bestmove;

            if (bestmoveUci && typeof bestmoveUci === 'string' && bestmoveUci.length >= 4) {
                const from = bestmoveUci.substring(0, 2);
                const to = bestmoveUci.substring(2, 4);
                const promotion = bestmoveUci.length > 4 ? bestmoveUci.substring(4) : undefined;
                if (makeMoveRef.current) {
                    makeMoveRef.current({ from, to, promotion }, true);
                }
            } else {
                 throw new Error("Invalid bestmove received from API.");
            }
        } catch (e) {
            console.error("Gagal mengambil gerakan AI:", e);
        } finally {
            setIsAiThinking(false);
            isFetchingAiMove.current = false;
        }
    }, []);

    const makeMove = useCallback((move: { from: Square; to: Square; promotion?: string }, isOpponentMove = false): boolean => {
        const gameCopy = new Chess(game.fen());
        const result = gameCopy.move(move);
        if (result === null) return false;

        setPossibleMoves([]); // Clear highlights
        setGame(gameCopy);
        setLastMoveHighlight({ from: result.from, to: result.to });
    
        const isGameOver = updateGameStatus(gameCopy);
        if (!isGameOver) {
            if (gameCopy.in_check()) {
                playSound('chess-move-check');
            } else if (result.flags.includes('p')) {
                playSound('chess-promote');
            } else if (result.flags.includes('k') || result.flags.includes('q')) {
                playSound('chess-castle');
            } else if (result.flags.includes('c') || result.flags.includes('e')) {
                playSound('chess-capture');
            } else {
                playSound(isOpponentMove ? 'chess-move-opponent' : 'chess-move-self');
            }
        }
        
        if (gameMode === 'online' && playerSymbol) {
            const opponentSymbol = playerSymbol === 'X' ? 'O' : 'X';
            const updatePayload: Partial<OnlineGameState> = {
                fen: gameCopy.fen(), lastMove: { from: result.from, to: result.to }, currentPlayer: opponentSymbol,
            };
            if (isGameOver) {
                if (gameCopy.in_checkmate()) updatePayload.winner = playerSymbol;
                else updatePayload.winner = 'Draw';
            }
            db.ref(`chess-games/${roomId}`).update(updatePayload);
        } else if (gameMode === 'ai' && !isGameOver && gameCopy.turn() === aiPlayerColor) {
            setTimeout(() => fetchAiMove(gameCopy.fen()), 500);
        }
        return true;
    }, [game, gameMode, playerSymbol, aiPlayerColor, playSound, updateGameStatus, roomId, fetchAiMove]);

    useEffect(() => {
        makeMoveRef.current = makeMove;
    }, [makeMove]);

    const onPieceDrop = (from: Square, to: Square): boolean => {
        setMoveFrom('');
        setPossibleMoves([]); // Clear highlights on drop
        const gameCopy = new Chess(game.fen());
        const piece = gameCopy.get(from);
        
        const isPromotion = piece?.type === 'p' &&
            ((piece.color === 'w' && from[1] === '7' && to[1] === '8') ||
             (piece.color === 'b' && from[1] === '2' && to[1] === '1'));
        
        const moveForValidation = gameCopy.move({ from, to, promotion: 'q' });
        if (moveForValidation === null) {
            playSound('chess-illegal');
            return false;
        }

        if (isPromotion) {
            moveForPromotion.current = { from, to };
            return true;
        }

        return makeMove({ from, to });
    };
    
    const onSquareClick = (square: Square) => {
        const gameCopy = new Chess(game.fen());
        const pieceOnSquare = gameCopy.get(square);
        
        // If it's not our turn, do nothing.
        const isMyTurn = !winner && !(gameMode === 'ai' && game.turn() === aiPlayerColor) && !isAiThinking;
        const isMyTurnOnline = gameMode === 'online' && !winner && playerSymbol && game.turn() === (playerSymbol === 'X' ? 'w' : 'b');
        if (!isMyTurn && !isMyTurnOnline) return;

        // First click (selecting a piece)
        if (!moveFrom) {
            if (pieceOnSquare && pieceOnSquare.color === game.turn()) {
                setMoveFrom(square);
                const moves = gameCopy.moves({ square: square, verbose: true });
                setPossibleMoves(moves.map(move => move.to));
            }
            return;
        }

        // Second click (making a move)
        if (square === moveFrom) { // Deselect
            setMoveFrom('');
            setPossibleMoves([]);
            return;
        }
        
        const isPromotion = game.get(moveFrom)?.type === 'p' &&
            ((game.get(moveFrom)?.color === 'w' && moveFrom[1] === '7' && square[1] === '8') ||
             (game.get(moveFrom)?.color === 'b' && moveFrom[1] === '2' && square[1] === '1'));
        
        const moveForValidation = gameCopy.move({ from: moveFrom, to: square, promotion: 'q' });

        if (moveForValidation === null) { // Invalid move
             playSound('chess-illegal');
             if (pieceOnSquare && pieceOnSquare.color === game.turn()) {
                 setMoveFrom(square); // Select new piece
                 const moves = game.moves({ square: square, verbose: true });
                 setPossibleMoves(moves.map(move => move.to));
             } else {
                 setMoveFrom(''); // Deselect
                 setPossibleMoves([]);
             }
             return;
        }

        if (isPromotion) {
             moveForPromotion.current = { from: moveFrom, to: square };
             setMoveFrom('');
             setPossibleMoves([]); // Clear highlights before promotion dialog
             // The promotion dialog will open, and onPromotionPieceSelect will handle the move.
        } else {
            makeMove({ from: moveFrom, to: square });
            setMoveFrom('');
        }
    };

    const onPromotionPieceSelect = (piece?: string) => { // e.g., 'wQ', 'bN'
        if (piece && moveForPromotion.current) {
            makeMove({ ...moveForPromotion.current, promotion: piece[1].toLowerCase() });
        }
        moveForPromotion.current = null;
        setPossibleMoves([]); // Ensure highlights are cleared if dialog is cancelled
        return true;
    };

    useEffect(() => {
        // This effect synchronizes the local game state with the online state from Firebase.
        // It only runs for opponent's moves by checking if the online FEN is different from the local FEN.
        if (gameMode === 'online' && onlineGameState && onlineGameState.fen !== game.fen()) {
            const newGame = new Chess(onlineGameState.fen);
    
            // Analyze the last move to play the correct sound effect.
            // This relies on having the *previous* game state, which is the `game` object from the last render cycle.
            if (!newGame.game_over() && onlineGameState.lastMove) {
                const oldGame = new Chess(game.fen()); // Create a copy of the state before the move.
                const moveResult = oldGame.move(onlineGameState.lastMove); // Simulate the opponent's move.
    
                if (moveResult) {
                    // Now that we have the result, we can determine the sound.
                    // oldGame is now the new game state after the move.
                    if (oldGame.in_check()) {
                        playSound('chess-move-check');
                    } else if (moveResult.flags.includes('p')) {
                        playSound('chess-promote');
                    } else if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) {
                        playSound('chess-castle');
                    } else if (moveResult.flags.includes('c') || moveResult.flags.includes('e')) {
                        playSound('chess-capture');
                    } else {
                        playSound('chess-move-opponent');
                    }
                } else {
                    // Fallback if the move simulation fails. This can happen in rare edge cases or if data is inconsistent.
                    playSound('chess-move-opponent');
                }
            }
            
            // Update the local state to match the server.
            setGame(newGame);
            setLastMoveHighlight(onlineGameState.lastMove);
            updateGameStatus(newGame);
        }
    }, [onlineGameState, gameMode, playSound, updateGameStatus, game]);

    const resetGame = (playerColor?: 'w' | 'b') => {
        const newGame = new Chess();
        setGame(newGame);
        setWinner(null);
        setLastMoveHighlight(null);
        setMoveFrom('');
        setPossibleMoves([]);
        if (gameMode === 'ai' && playerColor) {
            const aiColor = playerColor === 'w' ? 'b' : 'w';
            setAiPlayerColor(aiColor);
            if (aiColor === 'w') {
                setTimeout(() => fetchAiMove(newGame.fen()), 500);
            }
        }
    };

    const handleAiRematch = () => {
        playSound('select');
        // The user's new color will be the AI's old color.
        resetGame(aiPlayerColor as 'w' | 'b');
    };

    const customSquareStyles = useMemo(() => {
        const styles: { [key: string]: React.CSSProperties } = {};
        if (lastMoveHighlight) {
            styles[lastMoveHighlight.from] = { backgroundColor: 'rgba(25, 135, 84, 0.5)' };
            styles[lastMoveHighlight.to] = { backgroundColor: 'rgba(25, 135, 84, 0.5)' };
        }

        possibleMoves.forEach(square => {
            styles[square] = {
                ...styles[square],
                background: 'radial-gradient(circle, rgba(0, 0, 0, 0.4) 25%, transparent 26%)',
            };
        });
        
        if (moveFrom) {
            styles[moveFrom] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
        }
        if (kingInCheck) {
            styles[kingInCheck] = { background: 'radial-gradient(circle, rgba(220,53,69,0.7) 0%, rgba(220,53,69,0) 75%)' };
        }
        return styles;
    }, [lastMoveHighlight, kingInCheck, moveFrom, possibleMoves]);

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
        
        const isMyTurnOnline = !winner && game.turn() === myColor;

        return (
            <OnlineGameWrapper
                myPlayer={onlineGameState.players[mySymbol]}
                opponent={onlineGameState.players[opponentSymbol]}
                mySymbol={mySymbol}
                roomId={roomId}
                statusMessage={getStatusMessage()}
                isMyTurn={isMyTurnOnline}
                isGameOver={!!onlineGameState.winner || !!winner}
                rematchCount={(onlineGameState.rematch.X ? 1 : 0) + (onlineGameState.rematch.O ? 1 : 0)}
                amIReadyForRematch={!!(playerSymbol && onlineGameState.rematch[playerSymbol])}
                onRematch={handleOnlineRematch}
                chatMessages={onlineGameState.chatMessages}
                onSendMessage={sendChatMessage}
                opponentSideContent={<ChessPlayerBar player={onlineGameState.players[opponentSymbol]} capturedPieces={opponentCaptured} isMyTurn={game.turn() === opponentColor && !winner} />}
                mySideContent={<ChessPlayerBar player={onlineGameState.players[mySymbol]} capturedPieces={myCaptured} isMyTurn={game.turn() === myColor && !winner} />}
            >
                <div style={{ width: 'clamp(320px, 90vw, 700px)'}}>
                    {/* Fix: Changed prop from `boardPosition` to `position` */}
                    <Chessboard
                        position={game.fen()}
                        onPieceDrop={onPieceDrop}
                        onSquareClick={onSquareClick}
                        onPromotionPieceSelect={onPromotionPieceSelect}
                        boardOrientation={boardFlipped ? 'black' : 'white'}
                        arePiecesDraggable={isMyTurnOnline}
                        customSquareStyles={customSquareStyles}
                        promotionDialogVariant="default"
                    />
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
        
        const isMyTurnLocal = !winner && !(gameMode === 'ai' && game.turn() === aiPlayerColor) && !isAiThinking;
        
        return (
            <div className="d-flex flex-column align-items-center">
                 <p className="fs-4 fw-semibold mb-3">{getStatusMessage()}</p>
                 <div style={{ width: 'clamp(320px, 90vw, 700px)'}}>
                    {/* Fix: Changed prop from `boardPosition` to `position` */}
                    <Chessboard
                        position={game.fen()}
                        onPieceDrop={onPieceDrop}
                        onSquareClick={onSquareClick}
                        onPromotionPieceSelect={onPromotionPieceSelect}
                        boardOrientation={boardFlipped ? 'black' : 'white'}
                        arePiecesDraggable={isMyTurnLocal}
                        customSquareStyles={customSquareStyles}
                        promotionDialogVariant="default"
                    />
                 </div>
                 <div className="d-flex justify-content-center align-items-center gap-4 mt-3">
                    {winner && <button onClick={gameMode === 'ai' ? handleAiRematch : () => resetGame()} className="btn btn-primary">Main Lagi</button>}
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
