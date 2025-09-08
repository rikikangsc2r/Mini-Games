import { useState, useEffect, useCallback, useRef } from 'react';
import type { Player, GameMode } from '../types';
import useSounds from '../components/useSounds';
import { usePlayerStats, GameStatsID } from './usePlayerStats';

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

export type OnlineStep = 'profile' | 'room' | 'game';

const dbKeyToGameId = (dbKey: string): GameStatsID | null => {
    switch (dbKey) {
        case 'games': return 'tictactoe';
        case 'gobblet-games': return 'gobblet';
        case 'chess-games': return 'chess';
        case 'connect4-games': return 'connect4';
        default: return null;
    }
};

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
    const { recordGame } = usePlayerStats();
    
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
    
    // Efek ini memastikan playerSymbol selalu benar, bahkan setelah pertukaran pemain saat rematch.
    useEffect(() => {
        if (onlineGameState?.players) {
            if (onlineGameState.players.X?.deviceId === deviceId.current) {
                setPlayerSymbol('X');
            } else if (onlineGameState.players.O?.deviceId === deviceId.current) {
                setPlayerSymbol('O');
            }
        }
    }, [onlineGameState?.players]);
    
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
            const { committed, snapshot } = await roomRef.transaction(gameData => {
                // Jika room tidak ada, buat room baru.
                if (gameData === null) {
                    return createInitialGameState(playerProfile.name, deviceId.current, playerProfile.avatarUrl);
                }

                // Jika room kedaluwarsa, daur ulang.
                const oneHour = 3600 * 1000;
                const isExpired = Date.now() - gameData.createdAt > oneHour;
                if (isExpired) {
                    return createInitialGameState(playerProfile.name, deviceId.current, playerProfile.avatarUrl);
                }

                // Room ada dan tidak kedaluwarsa. Periksa apakah bisa bergabung.
                // Periksa apakah pengguna sudah ada di dalam game (bergabung kembali).
                if (gameData.players.X?.deviceId === deviceId.current || gameData.players.O?.deviceId === deviceId.current) {
                    return gameData; // Tidak perlu perubahan, pengguna sudah ada di dalam.
                }

                // Periksa apakah ada slot kosong untuk pemain O.
                if (!gameData.players.O) {
                    gameData.players.O = { deviceId: deviceId.current, name: playerProfile.name, avatarUrl: playerProfile.avatarUrl };
                    return gameData;
                }
                
                // Room penuh dan tidak kedaluwarsa. Batalkan transaksi.
                return; // undefined membatalkan transaksi
            });

            if (committed) {
                const finalGameState = snapshot.val();
                let symbol: Player | null = null;
                if (finalGameState.players.X?.deviceId === deviceId.current) {
                    symbol = 'X';
                } else if (finalGameState.players.O?.deviceId === deviceId.current) {
                    symbol = 'O';
                }

                if (symbol) {
                    setRoomId(enteredRoomId);
                    setPlayerSymbol(symbol);
                    setOnlineStep('game');
                } else {
                     // Ini terjadi jika transaksi dibatalkan (misalnya, room penuh).
                     setError('Room sudah penuh.');
                }
            } else {
                // Transaksi dibatalkan oleh logika kita.
                setError('Room sudah penuh.');
            }

        } catch (e) {
            setError('Gagal masuk room. Coba lagi.');
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [playerProfile, playSound, gameDbKey, createInitialGameState]);
    
    // Logika rematch yang diabstraksikan
    useEffect(() => {
        // Mencegah berjalan pada pemuatan awal atau jika status tidak ada
        if (!onlineGameState || !prevOnlineGameState || !playerSymbol) {
            return;
        }

        // Kami hanya ingin memicu logika reset SEKALI, saat kedua flag berubah menjadi true.
        // Status sebelumnya tidak boleh memiliki kedua flag sebagai true.
        const bothReadyNow = onlineGameState.rematch.X && onlineGameState.rematch.O;
        const wereBothReadyBefore = prevOnlineGameState.rematch.X && prevOnlineGameState.rematch.O;

        if (gameMode === 'online' && bothReadyNow && !wereBothReadyBefore) {
            // Tunjuk satu klien (pemain awal dari game yang selesai) untuk melakukan reset.
            // Ini mencegah kondisi balapan di mana kedua klien mencoba memperbarui status secara bersamaan.
            if (playerSymbol === onlineGameState.startingPlayer) {
                const roomRef = db.ref(`${gameDbKey}/${roomId}`);
                
                const newStartingPlayer = onlineGameState.startingPlayer === 'X' ? 'O' : 'X';
                
                // Tukar objek pemain
                const playerX = onlineGameState.players.X;
                const playerO = onlineGameState.players.O;
                
                const commonResetState = {
                    players: { X: playerO, O: playerX }, // Pemain ditukar
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
        }
    }, [onlineGameState, prevOnlineGameState, playerSymbol, gameMode, roomId, gameDbKey, getRematchState]);

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
        const updatedMessages = [...currentMessages, newMessage].slice(-20); // Simpan 20 pesan terakhir

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
            // Lawan bergabung
            if (!prevOnlineGameState.players.O && onlineGameState.players.O) {
                playSound('notify');
            }
            
            // Game berakhir - putar suara menang/kalah/seri
            if (!prevOnlineGameState.winner && onlineGameState.winner) {
                const gameId = dbKeyToGameId(gameDbKey);
                if (onlineGameState.winner === 'Draw') {
                    playSound('draw');
                    if (gameId) recordGame(gameId, 'draw');
                } else if (onlineGameState.winner === playerSymbol) {
                    playSound('win');
                    if (gameId) recordGame(gameId, 'win');
                } else {
                    playSound('draw'); // Suara kalah sama dengan seri
                    if (gameId) recordGame(gameId, 'loss');
                }
            }
            
            // Pesan baru diterima dari lawan
            if (
                (onlineGameState.chatMessages?.length || 0) > (prevOnlineGameState.chatMessages?.length || 0) &&
                onlineGameState.chatMessages[onlineGameState.chatMessages.length - 1].senderSymbol !== playerSymbol
            ) {
                 playSound('notify');
            }
        }
    }, [onlineGameState, prevOnlineGameState, onlineStep, playerSymbol, playSound, gameDbKey, recordGame]);

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