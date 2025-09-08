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

// --- Global Declarations ---
declare const firebase: any;
const db = firebase.database();
const ROWS = 6;
const COLS = 7;

// --- Type Definitions ---
type BoardState = (Player | null)[][];
interface WinningInfo {
    winner: Player | 'Draw';
    line: { r: number; c: number }[];
}
interface OnlineGameState extends BaseOnlineGameState {
    board: BoardState;
    winningLine: { r: number; c: number }[];
     players: {
        X: OnlinePlayer | null;
        O: OnlinePlayer | null;
    };
}

// --- Helper Functions ---
const createInitialBoard = (): BoardState => Array(ROWS).fill(null).map(() => Array(COLS).fill(null));

const createInitialOnlineState = (playerName: string, deviceId: string, avatarUrl: string): OnlineGameState => ({
    board: createInitialBoard(),
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
    winningLine: [],
    chatMessages: [],
});

const reconstructOnlineState = (gameData: any): OnlineGameState => {
    const reconstructedBoard = createInitialBoard();
    const boardData = gameData.board;
    if (boardData && typeof boardData === 'object') {
        Object.keys(boardData).forEach(r_key => {
            const r = parseInt(r_key, 10);
            if (isNaN(r) || r < 0 || r >= ROWS) return;
            const rowData = boardData[r_key];
            if (rowData && typeof rowData === 'object') {
                Object.keys(rowData).forEach(c_key => {
                    const c = parseInt(c_key, 10);
                    if (isNaN(c) || c < 0 || c >= COLS) return;
                    reconstructedBoard[r][c] = rowData[c_key];
                });
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

interface Connect4Props {
    onBackToMenu: () => void;
    description: string;
}

const Connect4: React.FC<Connect4Props> = ({ onBackToMenu, description }) => {
    const playSound = useSounds();
    const {
        gameMode, onlineStep, playerProfile, roomId, playerSymbol, onlineGameState,
        isLoading, error, roomInputRef, handleProfileSubmit, handleEnterRoom,
        handleRematch, changeGameMode, handleChangeProfileRequest, sendChatMessage,
    } = useOnlineGame('connect4-games', createInitialOnlineState, reconstructOnlineState, getRematchState, onBackToMenu);

    // Local & AI game state
    const [board, setBoard] = useState<BoardState>(createInitialBoard);
    const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
    const [winner, setWinner] = useState<Player | 'Draw' | null>(null);
    const [winningLine, setWinningLine] = useState<{ r: number; c: number }[]>([]);
    const [showRules, setShowRules] = useState(false);
    const [isAiThinking, setIsAiThinking] = useState(false);
    const [aiStarts, setAiStarts] = useState(false);


    const checkWinner = useCallback((currentBoard: BoardState): WinningInfo | null => {
        // Horizontal
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c <= COLS - 4; c++) {
                const player = currentBoard[r][c];
                if (player && player === currentBoard[r][c+1] && player === currentBoard[r][c+2] && player === currentBoard[r][c+3]) {
                    return { winner: player, line: [{r, c}, {r, c: c+1}, {r, c: c+2}, {r, c: c+3}] };
                }
            }
        }
        // Vertical
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r <= ROWS - 4; r++) {
                const player = currentBoard[r][c];
                if (player && player === currentBoard[r+1][c] && player === currentBoard[r+2][c] && player === currentBoard[r+3][c]) {
                    return { winner: player, line: [{r, c}, {r: r+1, c}, {r: r+2, c}, {r: r+3, c}] };
                }
            }
        }
        // Diagonal Down-Right
        for (let r = 0; r <= ROWS - 4; r++) {
            for (let c = 0; c <= COLS - 4; c++) {
                const player = currentBoard[r][c];
                if (player && player === currentBoard[r+1][c+1] && player === currentBoard[r+2][c+2] && player === currentBoard[r+3][c+3]) {
                    return { winner: player, line: [{r, c}, {r: r+1, c: c+1}, {r: r+2, c: c+2}, {r: r+3, c: c+3}] };
                }
            }
        }
        // Diagonal Up-Right
        for (let r = 3; r < ROWS; r++) {
            for (let c = 0; c <= COLS - 4; c++) {
                const player = currentBoard[r][c];
                if (player && player === currentBoard[r-1][c+1] && player === currentBoard[r-2][c+2] && player === currentBoard[r-3][c+3]) {
                    return { winner: player, line: [{r, c}, {r: r-1, c: c+1}, {r: r-2, c: c+2}, {r: r-3, c: c+3}] };
                }
            }
        }
        // Draw
        if (currentBoard[0].every(cell => cell !== null)) {
            return { winner: 'Draw', line: [] };
        }
        return null;
    }, []);

    const dropPiece = (boardState: BoardState, c: number, player: Player): { newBoard: BoardState; success: boolean } => {
        if (boardState[0][c]) return { newBoard: boardState, success: false };
        const newBoard = boardState.map(row => [...row]);
        for (let r = ROWS - 1; r >= 0; r--) {
            if (!newBoard[r][c]) {
                newBoard[r][c] = player;
                return { newBoard, success: true };
            }
        }
        return { newBoard: boardState, success: false };
    };

    const handleColumnClick = (c: number) => {
        const isAiTurn = gameMode === 'ai' && currentPlayer === 'O';
        if (winner || board[0][c] || isAiTurn) return;
        
        playSound('place');
        const { newBoard } = dropPiece(board, c, currentPlayer);
        
        setBoard(newBoard);
        const result = checkWinner(newBoard);
        if (result) {
            if (result.winner === 'Draw') playSound('draw'); else playSound('win');
            setWinner(result.winner);
            setWinningLine(result.line);
        } else {
            setCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X');
        }
    };
    
    const handleOnlineColumnClick = (c: number) => {
        if (!onlineGameState || onlineGameState.winner || onlineGameState.board[0][c] || onlineGameState.currentPlayer !== playerSymbol) return;
        playSound('place');
        const { newBoard } = dropPiece(onlineGameState.board, c, onlineGameState.currentPlayer);
        
        const result = checkWinner(newBoard);
        const updates: Partial<Pick<OnlineGameState, 'board' | 'currentPlayer' | 'winner' | 'winningLine'>> = {
            board: newBoard,
            currentPlayer: onlineGameState.currentPlayer === 'X' ? 'O' : 'X',
        };
        if (result) {
            updates.winner = result.winner;
            updates.winningLine = result.line;
        }
        db.ref(`connect4-games/${roomId}`).update(updates);
    };

     // --- AI Logic ---
    const evaluateWindow = useCallback((window: (Player | null)[], piece: Player) => {
        let score = 0;
        const opponent = piece === 'X' ? 'O' : 'X';
        const pieceCount = window.filter(p => p === piece).length;
        const opponentCount = window.filter(p => p === opponent).length;
        const emptyCount = window.filter(p => p === null).length;

        if (pieceCount === 4) score += 100;
        else if (pieceCount === 3 && emptyCount === 1) score += 5;
        else if (pieceCount === 2 && emptyCount === 2) score += 2;
        if (opponentCount === 3 && emptyCount === 1) score -= 80; // Block opponent's win is high priority

        return score;
    }, []);

    const scorePosition = useCallback((boardState: BoardState, piece: Player) => {
        let score = 0;
        const centerArray = boardState.map(row => row[Math.floor(COLS / 2)]);
        score += centerArray.filter(p => p === piece).length * 3;

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c <= COLS - 4; c++) {
                score += evaluateWindow(boardState[r].slice(c, c + 4), piece);
            }
        }
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r <= ROWS - 4; r++) {
                score += evaluateWindow([boardState[r][c], boardState[r+1][c], boardState[r+2][c], boardState[r+3][c]], piece);
            }
        }
        for (let r = 0; r <= ROWS - 4; r++) {
            for (let c = 0; c <= COLS - 4; c++) {
                score += evaluateWindow([boardState[r][c], boardState[r+1][c+1], boardState[r+2][c+2], boardState[r+3][c+3]], piece);
                score += evaluateWindow([boardState[r+3][c], boardState[r+2][c+1], boardState[r+1][c+2], boardState[r][c+3]], piece);
            }
        }
        return score;
    }, [evaluateWindow]);

    const minimax = useCallback((boardState: BoardState, depth: number, alpha: number, beta: number, maximizingPlayer: boolean): { score: number, column: number | null } => {
        const winnerInfo = checkWinner(boardState);
        if (winnerInfo) {
            if (winnerInfo.winner === 'O') return { score: 100000 - depth, column: null };
            if (winnerInfo.winner === 'X') return { score: -100000 + depth, column: null };
            return { score: 0, column: null };
        }
        if (depth === 0) return { score: scorePosition(boardState, 'O'), column: null };

        const validColumns = [3, 2, 4, 1, 5, 0, 6].filter(c => !boardState[0][c]);

        if (maximizingPlayer) {
            let value = -Infinity;
            let column = validColumns[0] ?? null;
            for (const c of validColumns) {
                const { newBoard } = dropPiece(boardState, c, 'O');
                const newScore = minimax(newBoard, depth - 1, alpha, beta, false).score;
                if (newScore > value) {
                    value = newScore;
                    column = c;
                }
                alpha = Math.max(alpha, value);
                if (alpha >= beta) break;
            }
            return { score: value, column };
        } else {
            let value = Infinity;
            let column = validColumns[0] ?? null;
            for (const c of validColumns) {
                const { newBoard } = dropPiece(boardState, c, 'X');
                const newScore = minimax(newBoard, depth - 1, alpha, beta, true).score;
                if (newScore < value) {
                    value = newScore;
                    column = c;
                }
                beta = Math.min(beta, value);
                if (alpha >= beta) break;
            }
            return { score: value, column };
        }
    }, [checkWinner, scorePosition, dropPiece]);

    useEffect(() => {
        if (gameMode === 'ai' && currentPlayer === 'O' && !winner) {
            setIsAiThinking(true);
            const timer = setTimeout(() => {
                const { column } = minimax(board, 4, -Infinity, Infinity, true); // Depth 4
                if (column !== null) {
                    playSound('place');
                    const { newBoard } = dropPiece(board, column, 'O');
                    setBoard(newBoard);
                    const result = checkWinner(newBoard);
                    if (result) {
                        if (result.winner === 'Draw') playSound('draw'); else playSound('win');
                        setWinner(result.winner);
                        setWinningLine(result.line);
                    } else {
                        setCurrentPlayer('X');
                    }
                }
                setIsAiThinking(false);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [gameMode, currentPlayer, winner, board, minimax, playSound, checkWinner, dropPiece]);
    
    const resetGame = () => {
        playSound('select');
        setBoard(createInitialBoard());
        setCurrentPlayer('X');
        setWinner(null);
        setWinningLine([]);
    };
    
    const handleAiRematch = () => {
        playSound('select');
        const newAiStarts = !aiStarts;
        setAiStarts(newAiStarts);
        setBoard(createInitialBoard());
        setCurrentPlayer(newAiStarts ? 'O' : 'X');
        setWinner(null);
        setWinningLine([]);
    };

    const getStatusMessage = () => {
        if (gameMode === 'local' || gameMode === 'ai') {
            if (winner) {
                if (winner === 'Draw') return "Hasilnya Seri!";
                if (gameMode === 'ai') return winner === 'X' ? 'Kamu Menang!' : 'AI Menang!';
                return `Pemain ${winner} Menang!`;
            }
            if (gameMode === 'ai') {
                if (isAiThinking) return 'AI sedang berpikir...';
                return currentPlayer === 'X' ? 'Giliranmu' : 'Giliran AI';
            }
            return `Giliran Pemain ${currentPlayer}`;
        }
        if (onlineGameState) {
            const { winner, currentPlayer, players } = onlineGameState;
            if (winner) {
                if (winner === 'Draw') return "Hasilnya Seri!";
                const winnerName = players[winner as Player]?.name;
                return winner === playerSymbol ? "Kamu Menang!" : `${winnerName || 'Lawan'} Menang!`;
            }
            return currentPlayer === playerSymbol ? "Giliranmu" : `Menunggu ${players[currentPlayer]?.name || 'Lawan'}`;
        }
        return '';
    };

    const renderGameBoard = (
        boardToRender: BoardState,
        winningLineToRender: { r: number, c: number }[],
        isTurn: boolean,
        isGameOver: boolean
    ) => {
        const viewBoxWidth = COLS * 100;
        const viewBoxHeight = ROWS * 100;
        const cellPadding = 10;
        const pieceRadius = (100 - cellPadding * 2) / 2;

        const getCellCenter = (r: number, c: number) => ({
            cx: c * 100 + 50,
            cy: r * 100 + 50,
        });
        
        const handleClick = gameMode === 'online' ? handleOnlineColumnClick : handleColumnClick;
        const isInteractive = (gameMode === 'online' && isTurn) || (gameMode !== 'online' && !isGameOver);

        return (
            <div className="connect4-container">
                <svg
                    className="connect4-svg"
                    viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                    preserveAspectRatio="xMidYMid meet"
                >
                    <defs>
                        <radialGradient id="yellow-gradient" cx="40%" cy="40%" r="60%">
                            <stop offset="0%" stopColor="#fff2a8" />
                            <stop offset="30%" stopColor="#ffd700" />
                            <stop offset="100%" stopColor="#ffc107" />
                        </radialGradient>
                        <radialGradient id="red-gradient" cx="40%" cy="40%" r="60%">
                            <stop offset="0%" stopColor="#f08080" />
                            <stop offset="30%" stopColor="#e74c3c" />
                            <stop offset="100%" stopColor="#dc3545" />
                        </radialGradient>
                        <mask id="connect4-board-mask">
                            <rect width={viewBoxWidth} height={viewBoxHeight} fill="white" />
                            {Array.from({ length: ROWS * COLS }).map((_, i) => {
                                const r = Math.floor(i / COLS);
                                const c = i % COLS;
                                const { cx, cy } = getCellCenter(r, c);
                                return <circle key={`mask-${r}-${c}`} cx={cx} cy={cy} r={pieceRadius} fill="black" />;
                            })}
                        </mask>
                    </defs>

                    <rect
                        className="connect4-board-frame"
                        width={viewBoxWidth}
                        height={viewBoxHeight}
                        rx="30"
                        mask="url(#connect4-board-mask)"
                    />

                    {boardToRender.map((row, r) =>
                        row.map((piece, c) => {
                            if (!piece) return null;
                            const { cx, cy } = getCellCenter(r, c);
                            const isWinner = winningLineToRender.some(pos => pos.r === r && pos.c === c);
                            return (
                                <circle
                                    key={`piece-${r}-${c}`}
                                    className={`connect4-piece player-${piece} ${isWinner ? 'winner' : ''}`}
                                    cx={cx}
                                    cy={cy}
                                    r={pieceRadius}
                                    style={{
                                        animationDelay: `${(ROWS - 1 - r) * 0.05}s`
                                    }}
                                />
                            );
                        })
                    )}
                </svg>
                
                <div className="connect4-interactive-grid">
                    {Array.from({ length: COLS }).map((_, c) => (
                        <div
                            key={`col-${c}`}
                            className={`connect4-interactive-col ${(!isInteractive || boardToRender[0][c]) ? 'disabled' : ''}`}
                            onClick={() => handleClick(c)}
                            role="button"
                            aria-label={`Jatuhkan bidak di kolom ${c + 1}`}
                        />
                    ))}
                </div>
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
        const isMyTurn = onlineGameState.currentPlayer === playerSymbol && !onlineGameState.winner;

        return (
            <OnlineGameWrapper
                myPlayer={onlineGameState.players[mySymbol]}
                opponent={onlineGameState.players[opponentSymbol]}
                mySymbol={mySymbol}
                roomId={roomId}
                statusMessage={getStatusMessage()}
                isMyTurn={isMyTurn}
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
                    isMyTurn,
                    !!onlineGameState.winner
                )}
            </OnlineGameWrapper>
        );
    };
    
    const renderContent = () => {
        switch(gameMode) {
            case 'menu':
                return <GameModeSelector title="Connect 4" description={description} changeGameMode={changeGameMode} />;
            case 'local':
                return (
                    <div className="text-center">
                        <div className="mb-4"><p className={`mt-3 fs-4 fw-semibold ${winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p></div>
                        {renderGameBoard(board, winningLine, true, !!winner)}
                        {winner && <button onClick={resetGame} className="mt-4 btn btn-primary btn-lg">Main Lagi</button>}
                    </div>
                );
            case 'ai':
                return (
                    <div className="text-center">
                        <div className="mb-4"><p className={`mt-3 fs-4 fw-semibold ${winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p></div>
                        {renderGameBoard(board, winningLine, !isAiThinking, !!winner)}
                        {winner && <button onClick={handleAiRematch} className="mt-4 btn btn-primary btn-lg">Rematch</button>}
                    </div>
                );
            case 'online': return renderOnlineContent();
        }
    };

    return (
        <div className="d-flex flex-column align-items-center justify-content-center position-relative" style={{ minHeight: '80vh' }}>
            <BackButton onClick={gameMode === 'menu' ? onBackToMenu : () => changeGameMode('menu')} />
            <div className="text-center mb-4">
              {gameMode !== 'menu' && (
                 <div className="d-flex justify-content-center align-items-center gap-3">
                    <h2 className="display-5 fw-bold text-white mb-0">Connect 4</h2>
                    <button onClick={() => setShowRules(true)} className="btn btn-sm btn-outline-secondary" aria-label="Tampilkan Aturan">Aturan</button>
                </div>
              )}
            </div>
            {renderContent()}

            <RulesModal title="Aturan Connect 4" show={showRules} onClose={() => setShowRules(false)}>
                <p>Tujuan permainan ini adalah menjadi pemain pertama yang menghubungkan empat cakram warnamu secara berurutan.</p>
                <ul className="list-unstyled ps-3">
                    <li>- Pemain bergiliran menjatuhkan cakram dari atas ke dalam salah satu dari tujuh kolom.</li>
                    <li>- Cakram akan jatuh ke posisi terendah yang tersedia di kolom tersebut.</li>
                    <li>- Kemenangan diraih dengan membentuk barisan empat cakram secara horizontal, vertikal, atau diagonal.</li>
                    <li>- Jika seluruh papan terisi dan tidak ada yang menang, permainan berakhir seri.</li>
                </ul>
            </RulesModal>
        </div>
    );
};

export default Connect4;
