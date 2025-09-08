import { useCallback, useState, useEffect } from 'react';

export type GameStatsID = 'tictactoe' | 'gobblet' | 'chess' | 'connect4';
export type GameResult = 'win' | 'loss' | 'draw';

export interface SingleGameStats {
    wins: number;
    losses: number;
    draws: number;
}

export type AllGameStats = Record<GameStatsID, SingleGameStats>;

const STATS_STORAGE_KEY = 'nkgame-player-stats';

const createInitialStats = (): AllGameStats => ({
    tictactoe: { wins: 0, losses: 0, draws: 0 },
    gobblet: { wins: 0, losses: 0, draws: 0 },
    chess: { wins: 0, losses: 0, draws: 0 },
    connect4: { wins: 0, losses: 0, draws: 0 },
});

const getStats = (): AllGameStats => {
    try {
        const storedStats = localStorage.getItem(STATS_STORAGE_KEY);
        if (storedStats) {
            const parsed = JSON.parse(storedStats);
            // Validasi sederhana untuk menggabungkan dengan statistik awal jika game baru ditambahkan
            return { ...createInitialStats(), ...parsed };
        }
    } catch (e) {
        console.error("Gagal mengurai statistik pemain dari localStorage", e);
    }
    return createInitialStats();
};

const saveStats = (stats: AllGameStats) => {
    try {
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
    } catch (e) {
        console.error("Gagal menyimpan statistik pemain ke localStorage", e);
    }
};

export const usePlayerStats = () => {
    const [stats, setStats] = useState<AllGameStats>(getStats);

    useEffect(() => {
        // Efek ini memungkinkan komponen untuk dirender ulang jika statistik diperbarui di tempat lain,
        // misalnya, di tab lain (meskipun tidak mungkin untuk aplikasi ini, ini adalah praktik yang baik).
        const handleStorageChange = () => {
            setStats(getStats());
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const recordGame = useCallback((gameId: GameStatsID, result: GameResult) => {
        setStats(prevStats => {
            const newStats = { ...prevStats };
            const gameStats = { ...newStats[gameId] };

            if (result === 'win') {
                gameStats.wins += 1;
            } else if (result === 'loss') {
                gameStats.losses += 1;
            } else if (result === 'draw') {
                gameStats.draws += 1;
            }

            newStats[gameId] = gameStats;
            saveStats(newStats);
            return newStats;
        });
    }, []);

    const resetStats = useCallback(() => {
        const initialStats = createInitialStats();
        saveStats(initialStats);
        setStats(initialStats);
    }, []);


    return { stats, recordGame, resetStats };
};
