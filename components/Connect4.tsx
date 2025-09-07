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
});

const getRematchState = (): Partial<OnlineGameState> => ({
    board: createInitialBoard(),
    winningLine: [],
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
    };
};

const Connect4: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const playSound = useSounds();
    const {
        gameMode, onlineStep, playerProfile, roomId, playerSymbol, onlineGameState,
        isLoading, error, roomInputRef, handleProfileSubmit, handleEnterRoom,
        handleOnlineBack, handleRematch, changeGameMode, handleChangeProfileRequest,
    } = useOnlineGame('connect4-games', createInitialOnlineState, reconstructOnlineState, getRematchState);

    // Local game state
    const [board, setBoard] = useState<BoardState>(createInitialBoard);
    const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
    const [winner, setWinner] = useState<Player | 'Draw' | null>(null);
    const [winningLine, setWinningLine] = useState<{ r: number; c: number }[]>([]);
    const [showRules, setShowRules] = useState(false);

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

    const handleColumnClick = (c: number) => {
        if (gameMode === 'local') {
            if (winner || board[0][c]) return;
            playSound('place');
            const newBoard = board.map(row => [...row]);
            for (let r = ROWS - 1; r >= 0; r--) {
                if (!newBoard[r][c]) {
                    newBoard[r][c] = currentPlayer;
                    break;
                }
            }
            setBoard(newBoard);
            const result = checkWinner(newBoard);
            if (result) {
                if (result.winner === 'Draw') playSound('draw'); else playSound('win');
                setWinner(result.winner);
                setWinningLine(result.line);
            } else {
                setCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X');
            }
        } else if (gameMode === 'online' && onlineGameState) {
            if (onlineGameState.winner || onlineGameState.board[0][c] || onlineGameState.currentPlayer !== playerSymbol) return;
            playSound('place');
            const newBoard = onlineGameState.board.map(row => [...row]);
            for (let r = ROWS - 1; r >= 0; r--) {
                if (!newBoard[r][c]) {
                    newBoard[r][c] = onlineGameState.currentPlayer;
                    break;
                }
            }
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
        }
    };
    
    const resetLocalGame = () => {
        playSound('select');
        setBoard(createInitialBoard());
        setCurrentPlayer('X');
        setWinner(null);
        setWinningLine([]);
    };

    const getStatusMessage = () => {
        if (gameMode === 'local') {
            if (winner) return winner === 'Draw' ? "Hasilnya Seri!" : `Pemain ${winner} Menang!`;
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
    ) => (
        <div className="connect4-board">
            {Array.from({ length: COLS }).map((_, c) => (
                <div
                    key={c}
                    className={`connect4-col ${(!isTurn || isGameOver || boardToRender[0][c]) ? 'disabled' : ''}`}
                    onClick={() => handleColumnClick(c)}
                    role="button"
                    aria-label={`Drop piece in column ${c + 1}`}
                >
                    {Array.from({ length: ROWS }).map((_, r) => {
                        const piece = boardToRender[r][c];
                        const isWinner = winningLineToRender.some(pos => pos.r === r && pos.c === c);
                        return (
                            <div key={r} className="connect4-cell">
                                {piece && (
                                    <div
                                        className={`connect4-piece player-${piece} ${isWinner ? 'winner' : ''}`}
                                        style={{ animationDelay: `${(ROWS - 1 - r) * 0.05}s` }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
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
        return (
            <div className="text-center">
                <div className="mb-4 d-flex flex-column align-items-center gap-3">
                     <div className="d-flex justify-content-center align-items-center gap-3 w-100" style={{maxWidth: '450px'}}>
                        <PlayerDisplay player={onlineGameState.players.X} />
                        <span className="gradient-text fw-bolder fs-4">VS</span>
                        <PlayerDisplay player={onlineGameState.players.O} />
                    </div>
                    <p className="text-muted mb-0">Room: {roomId}</p>
                    <p className={`mt-2 fs-4 fw-semibold ${onlineGameState.winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p>
                </div>
                {renderGameBoard(onlineGameState.board, onlineGameState.winningLine, onlineGameState.currentPlayer === playerSymbol, !!onlineGameState.winner)}
                {onlineGameState.winner && <button onClick={handleRematch} disabled={!!amIReadyForRematch} className="mt-4 btn btn-primary btn-lg">Rematch ({rematchCount}/2)</button>}
            </div>
        );
    };
    
    const renderContent = () => {
        switch(gameMode) {
            case 'menu':
                return <GameModeSelector title="Connect 4" changeGameMode={changeGameMode} />;
            case 'local':
                return (
                    <div className="text-center">
                        <div className="mb-4"><p className={`mt-3 fs-4 fw-semibold ${winner ? 'text-success' : 'text-light'}`}>{getStatusMessage()}</p></div>
                        {renderGameBoard(board, winningLine, true, !!winner)}
                        {winner && <button onClick={resetLocalGame} className="mt-4 btn btn-primary btn-lg">Main Lagi</button>}
                    </div>
                );
            case 'online': return renderOnlineContent();
        }
    };

    return (
        <div className="d-flex flex-column align-items-center justify-content-center position-relative" style={{ minHeight: '80vh' }}>
            <BackButton onClick={gameMode === 'menu' ? onBack : handleOnlineBack} />
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