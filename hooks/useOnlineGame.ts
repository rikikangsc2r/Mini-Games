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
    avatarUrl: string;
}

export interface PlayerProfile {
    name: string;
    avatarUrl: string;
}

export interface ChatMessage {
    senderSymbol: Player;
    type: 'emote' | 'quickchat';
    content: string;
    timestamp: number;
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
    chatMessages: ChatMessage[];
}

export type GameMode = 'menu' | 'local' | 'online';
export type OnlineStep = 'profile' | 'room' | 'game';

export const useOnlineGame = <T extends BaseOnlineGameState>(
    gameDbKey: string,
    createInitialGameState: (playerName: string, deviceId: string, avatarUrl: string) => T,
    reconstructState: (firebaseData: any) => T,
    getRematchState: () => Partial<T>,
    onBackToMainMenu: () => void
) => {
    const [gameMode, setGameMode] = useState<GameMode>('menu');
    const [onlineStep, setOnlineStep] = useState<OnlineStep>('profile');
    const playSound = useSounds();
    
    const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
    const [roomId, setRoomId] = useState('');
    const [playerSymbol, setPlayerSymbol] = useState<Player | null>(null);
    const [onlineGameState, setOnlineGameState] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    
    const roomInputRef = useRef<HTMLInputElement>(null);
    const deviceId = useRef<string>(getDeviceId());
    const prevOnlineGameState = usePrevious(onlineGameState);

    useEffect(() => {
        const storedProfile = localStorage.getItem('playerProfile');
        if (storedProfile) {
            try {
                const profile = JSON.parse(storedProfile);
                if (profile && profile.name && profile.avatarUrl) {
                    setPlayerProfile(profile);
                    setOnlineStep('room');
                }
            } catch (e) {
                localStorage.removeItem('playerProfile');
            }
        }
    }, []);
    
    const handleProfileSubmit = (name: string, avatarUrl: string) => {
        const profile = { name, avatarUrl };
        playSound('select');
        setPlayerProfile(profile);
        localStorage.setItem('playerProfile', JSON.stringify(profile));
        setOnlineStep('room');
        setError('');
    };

    const handleEnterRoom = useCallback(async () => {
        const enteredRoomId = roomInputRef.current?.value.trim().toUpperCase();
        if (!enteredRoomId) {
            setError('Nama room tidak boleh kosong.');
            return;
        }
        if (!playerProfile) {
            setError('Profil pemain tidak ditemukan. Harap atur profil Anda.');
            setOnlineStep('profile');
            return;
        }

        playSound('select');
        setIsLoading(true);
        setError('');
        
        const roomRef = db.ref(`${gameDbKey}/${enteredRoomId}`);
        try {
            const snapshot = await roomRef.get();
            const gameData: T | null = snapshot.val();
            const isExpired = gameData && (Date.now() - gameData.createdAt > 3600 * 1000 * 3); // 3 hours

            let joined = false;
            let symbol: Player | null = null;

            if (!snapshot.exists() || isExpired) {
                const newGame = createInitialGameState(playerProfile.name, deviceId.current, playerProfile.avatarUrl);
                await roomRef.set(newGame);
                symbol = 'X';
                joined = true;
            } else {
                if (gameData.players.X?.deviceId === deviceId.current) {
                   symbol = 'X';
                   joined = true;
                } else if (gameData.players.O?.deviceId === deviceId.current) {
                    symbol = 'O';
                    joined = true;
                } else if (!gameData.players.O) {
                    await roomRef.child('players/O').set({ deviceId: deviceId.current, name: playerProfile.name, avatarUrl: playerProfile.avatarUrl });
                    symbol = 'O';
                    joined = true;
                } else {
                    setError('Room sudah penuh.');
                }
            }

            if(joined && symbol) {
                setRoomId(enteredRoomId);
                setPlayerSymbol(symbol);
                setOnlineStep('game');
            }

        } catch (e) {
            setError('Gagal masuk room. Coba lagi.');
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [playerProfile, playSound, gameDbKey, createInitialGameState]);
    
    // Abstracted rematch logic
    useEffect(() => {
        if (gameMode === 'online' && onlineGameState?.rematch.X && onlineGameState?.rematch.O) {
            const roomRef = db.ref(`${gameDbKey}/${roomId}`);
            const newStartingPlayer = onlineGameState.startingPlayer === 'X' ? 'O' : 'X';
            
            const commonResetState = {
                currentPlayer: newStartingPlayer,
                winner: null,
                rematch: { X: false, O: false },
                startingPlayer: newStartingPlayer,
            };

            const gameSpecificResetState = getRematchState();
            
            roomRef.update({
                ...commonResetState,
                ...gameSpecificResetState,
            });
        }
    }, [onlineGameState, gameMode, roomId, gameDbKey, getRematchState]);

    const changeGameMode = (mode: GameMode) => {
        playSound('select');
        setGameMode(mode);
    };

    const handleRematch = () => {
        if (!roomId || !playerSymbol) return;
        playSound('select');
        db.ref(`${gameDbKey}/${roomId}/rematch/${playerSymbol}`).set(true);
    };

    const sendChatMessage = useCallback((type: 'emote' | 'quickchat', content: string) => {
        if (!roomId || !playerSymbol || !onlineGameState) return;

        const newMessage: ChatMessage = {
            senderSymbol: playerSymbol,
            type,
            content,
            timestamp: Date.now(),
        };

        const currentMessages = onlineGameState.chatMessages || [];
        const updatedMessages = [...currentMessages, newMessage].slice(-20); // Keep last 20 messages

        db.ref(`${gameDbKey}/${roomId}/chatMessages`).set(updatedMessages);

    }, [roomId, playerSymbol, onlineGameState, gameDbKey]);

    const handleChangeProfileRequest = useCallback(() => {
        playSound('back');
        setOnlineStep('profile');
    }, [playSound]);

    const firebaseListenerCallback = useCallback((snapshot: any) => {
        if (snapshot.exists()) {
            const gameData = snapshot.val();
            const sanitizedGameData = reconstructState(gameData);
            setOnlineGameState(sanitizedGameData);
        } else {
            setError('Room tidak ada lagi.');
            onBackToMainMenu();
        }
    }, [reconstructState, onBackToMainMenu]);

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
            
            // New message received from opponent
            if (
                onlineGameState.chatMessages.length > prevOnlineGameState.chatMessages.length &&
                onlineGameState.chatMessages[onlineGameState.chatMessages.length - 1].senderSymbol !== playerSymbol
            ) {
                 playSound('notify');
            }
        }
    }, [onlineGameState, prevOnlineGameState, onlineStep, playerSymbol, playSound, gameDbKey]);

    return {
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
    };
};