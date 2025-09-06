import { useState, useEffect, useCallback, useRef } from 'react';
import type { Player } from '../types';
import useSounds from '../components/useSounds';

declare const firebase: any;
const db = firebase.database();

const getDeviceId = (): string => {
    let id = localStorage.getItem('deviceId');
    if (!id) {
        id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('deviceId', id);
    }
    return id;
};

function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T | undefined>(undefined);
    useEffect(() => {
        ref.current = value;
    }, [value]);
    return ref.current;
}

export interface OnlinePlayer {
    deviceId: string;
    name: string;
}

export interface BaseOnlineGameState {
    players: {
        X: OnlinePlayer | null;
        O: OnlinePlayer | null;
    };
    createdAt: any;
    rematch: { X: boolean; O: boolean };
    startingPlayer: Player;
    currentPlayer: Player;
    winner: Player | 'Draw' | null;
}

export type GameMode = 'menu' | 'local' | 'online';
export type OnlineStep = 'name' | 'room' | 'game';

export const useOnlineGame = <T extends BaseOnlineGameState>(
    gameDbKey: string,
    createInitialGameState: (playerName: string, deviceId: string) => T,
    reconstructState: (firebaseData: any) => T,
) => {
    const [gameMode, setGameMode] = useState<GameMode>('menu');
    const [onlineStep, setOnlineStep] = useState<OnlineStep>('name');
    const playSound = useSounds();
    
    const [playerName, setPlayerName] = useState('');
    const [roomId, setRoomId] = useState('');
    const [playerSymbol, setPlayerSymbol] = useState<Player | null>(null);
    const [onlineGameState, setOnlineGameState] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    
    const nameInputRef = useRef<HTMLInputElement>(null);
    const roomInputRef = useRef<HTMLInputElement>(null);
    const deviceId = useRef<string>(getDeviceId());
    const prevOnlineGameState = usePrevious(onlineGameState);

    useEffect(() => {
        const storedName = localStorage.getItem('playerName');
        if (storedName) {
            setPlayerName(storedName);
            setOnlineStep('room');
        }
    }, []);

    const handleNameSubmit = () => {
        const name = nameInputRef.current?.value.trim();
        if (name) {
            playSound('select');
            setPlayerName(name);
            localStorage.setItem('playerName', name);
            setOnlineStep('room');
            setError('');
        } else {
            setError('Nama tidak boleh kosong.');
        }
    };

    const handleEnterRoom = useCallback(async () => {
        const enteredRoomId = roomInputRef.current?.value.trim().toUpperCase();
        if (!enteredRoomId) {
            setError('Nama room tidak boleh kosong.');
            return;
        }
        playSound('select');
        setIsLoading(true);
        setError('');
        
        const roomRef = db.ref(`${gameDbKey}/${enteredRoomId}`);
        try {
            const snapshot = await roomRef.get();
            const gameData: T | null = snapshot.val();
            const isExpired = gameData && (Date.now() - gameData.createdAt > 3600 * 1000); // 1 hour

            if (!snapshot.exists() || isExpired) {
                const newGame = createInitialGameState(playerName, deviceId.current);
                await roomRef.set(newGame);
                setRoomId(enteredRoomId);
                setPlayerSymbol('X');
                setOnlineStep('game');
            } else {
                if (gameData.players.X?.deviceId === deviceId.current) {
                    setRoomId(enteredRoomId);
                    setPlayerSymbol('X');
                    setOnlineStep('game');
                } else if (gameData.players.O?.deviceId === deviceId.current) {
                    setRoomId(enteredRoomId);
                    setPlayerSymbol('O');
                    setOnlineStep('game');
                } else if (!gameData.players.O) {
                    await roomRef.child('players/O').set({ deviceId: deviceId.current, name: playerName });
                    setRoomId(enteredRoomId);
                    setPlayerSymbol('O');
                    setOnlineStep('game');
                } else {
                    setError('Room sudah penuh.');
                }
            }
        } catch (e) {
            setError('Gagal masuk room. Coba lagi.');
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [playerName, playSound, gameDbKey, createInitialGameState]);
    
    const changeGameMode = (mode: GameMode) => {
        playSound('select');
        setGameMode(mode);
    };

    const handleRematch = () => {
        if (!roomId || !playerSymbol) return;
        playSound('select');
        db.ref(`${gameDbKey}/${roomId}/rematch/${playerSymbol}`).set(true);
    };

    const handleChangeNameRequest = useCallback(() => {
        playSound('back');
        setOnlineStep('name');
    }, [playSound]);

    const handleOnlineBack = useCallback(() => {
        playSound('back');
        setError('');
        if (onlineStep === 'game' || onlineStep === 'room') {
            setRoomId('');
            setPlayerSymbol(null);
            setOnlineGameState(null);
            setOnlineStep('room');
            if (onlineStep === 'room') {
                setGameMode('menu');
            }
        } else if (onlineStep === 'name') {
            setGameMode('menu');
        }
    }, [onlineStep, playSound]);

    const firebaseListenerCallback = useCallback((snapshot: any) => {
        if (snapshot.exists()) {
            const gameData = snapshot.val();
            const sanitizedGameData = reconstructState(gameData);
            setOnlineGameState(sanitizedGameData);
        } else {
            setError('Room tidak ada lagi.');
            handleOnlineBack();
        }
    }, [reconstructState, handleOnlineBack]);

    useEffect(() => {
        if (onlineStep !== 'game' || !roomId) return;
        
        const roomRef = db.ref(`${gameDbKey}/${roomId}`);
        roomRef.on('value', firebaseListenerCallback);
        return () => roomRef.off('value', firebaseListenerCallback);
    }, [roomId, onlineStep, gameDbKey, firebaseListenerCallback]);
    
    useEffect(() => {
        if (onlineStep === 'game' && onlineGameState && prevOnlineGameState) {
            // Opponent joined
            if (!prevOnlineGameState.players.O && onlineGameState.players.O) {
                playSound('notify');
            }
            
            // Opponent made a move (for non-chess games)
            if (
                gameDbKey !== 'chess-games' &&
                onlineGameState.currentPlayer === playerSymbol &&
                prevOnlineGameState.currentPlayer !== playerSymbol &&
                !onlineGameState.winner &&
                onlineGameState.players.X && onlineGameState.players.O
            ) {
                playSound('place');
            }

            // Game ended
            if (!prevOnlineGameState.winner && onlineGameState.winner) {
                if (onlineGameState.winner === 'Draw') {
                    playSound('draw');
                } else if (onlineGameState.winner === playerSymbol) {
                    playSound('win');
                } else {
                    playSound('draw'); // Loss sound
                }
            }
        }
    }, [onlineGameState, prevOnlineGameState, onlineStep, playerSymbol, playSound, gameDbKey]);

    return {
        gameMode,
        onlineStep,
        playerName,
        roomId,
        playerSymbol,
        onlineGameState,
        isLoading,
        error,
        nameInputRef,
        roomInputRef,
        handleNameSubmit,
        handleEnterRoom,
        handleOnlineBack,
        handleRematch,
        changeGameMode,
        handleChangeNameRequest,
    };
};
