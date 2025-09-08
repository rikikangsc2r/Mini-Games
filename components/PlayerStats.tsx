import React, { useState, useEffect, useMemo } from 'react';
import BackButton from './BackButton';
import { usePlayerStats, GameStatsID } from '../hooks/usePlayerStats';
import type { PlayerProfile } from '../hooks/useOnlineGame';

const gameNames: Record<GameStatsID, string> = {
    tictactoe: 'Tic-Tac-Toe',
    gobblet: 'Gobblet Gobblers',
    chess: 'Catur',
    connect4: 'Connect 4',
};

const DonutChart: React.FC<{ wins: number; losses: number; draws: number; size?: number }> = ({ wins, losses, draws, size = 150 }) => {
    const total = wins + losses + draws;
    if (total === 0) return <div style={{ width: size, height: size }} className="d-flex align-items-center justify-content-center bg-secondary rounded-circle"><span className="text-muted small">Tidak Ada Data</span></div>;

    const r = 40;
    const circumference = 2 * Math.PI * r;
    const winRate = Math.round((wins / total) * 100);

    const winPercent = wins / total;
    const lossPercent = losses / total;
    const drawPercent = draws / total;

    return (
        <div className="position-relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                {/* Background */}
                <circle cx="50" cy="50" r={r} fill="transparent" stroke="#343a40" strokeWidth="15" />
                {/* Segments */}
                <circle cx="50" cy="50" r={r} fill="transparent" stroke="#dc3545" strokeWidth="15" strokeDasharray={`${lossPercent * circumference} ${circumference}`} />
                <circle cx="50" cy="50" r={r} fill="transparent" stroke="#6c757d" strokeWidth="15" strokeDasharray={`${drawPercent * circumference} ${circumference}`} transform={`rotate(${lossPercent * 360} 50 50)`} />
                <circle cx="50" cy="50" r={r} fill="transparent" stroke="#198754" strokeWidth="15" strokeDasharray={`${winPercent * circumference} ${circumference}`} transform={`rotate(${(lossPercent + drawPercent) * 360} 50 50)`} />
            </svg>
            <div className="position-absolute top-50 start-50 translate-middle text-center">
                <div className="fw-bold text-white fs-4">{winRate}%</div>
                <div className="text-muted small" style={{marginTop: '-5px'}}>Menang</div>
            </div>
        </div>
    );
};


interface PlayerStatsProps {
    onBackToMenu: () => void;
}

const PlayerStats: React.FC<PlayerStatsProps> = ({ onBackToMenu }) => {
    const { stats, resetStats } = usePlayerStats();
    const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);

    useEffect(() => {
        const storedProfile = localStorage.getItem('playerProfile');
        if (storedProfile) {
            setPlayerProfile(JSON.parse(storedProfile));
        }
    }, []);

    const overallStats = useMemo(() => {
        return Object.values(stats).reduce((acc, game) => {
            acc.wins += game.wins;
            acc.losses += game.losses;
            acc.draws += game.draws;
            return acc;
        }, { wins: 0, losses: 0, draws: 0 });
    }, [stats]);

    const totalGames = overallStats.wins + overallStats.losses + overallStats.draws;

    const handleResetStats = () => {
        if (window.confirm('Apakah Anda yakin ingin mengatur ulang semua statistik game Anda? Tindakan ini tidak dapat diurungkan.')) {
            resetStats();
        }
    };

    return (
        <div className="container py-5 position-relative">
            <BackButton onClick={onBackToMenu} />
            <div className="text-center mb-5">
                <h2 className="display-5 fw-bold text-white">Statistik Pemain</h2>
            </div>

            {playerProfile && (
                <div className="d-flex flex-column align-items-center mb-5 p-4 rounded-3 bg-secondary">
                    <img src={playerProfile.avatarUrl} alt="Player Avatar" className="player-avatar mb-3" style={{ width: '100px', height: '100px' }} />
                    <h3 className="text-white">{playerProfile.name}</h3>
                </div>
            )}
            
            {totalGames === 0 ? (
                <div className="text-center text-muted p-5 bg-secondary rounded-3">
                    <p className="fs-4">Belum ada data game.</p>
                    <p>Mainkan beberapa game online untuk melihat statistikmu di sini!</p>
                </div>
            ) : (
                <>
                    <div className="card bg-secondary text-light mb-5 shadow">
                        <div className="card-header"><h4 className="mb-0 text-info">Ringkasan Keseluruhan</h4></div>
                        <div className="card-body d-flex flex-column flex-md-row align-items-center justify-content-around p-4 gap-4">
                            <DonutChart wins={overallStats.wins} losses={overallStats.losses} draws={overallStats.draws} />
                            <div className="d-flex flex-column gap-3 text-center text-md-start">
                                <h5 className="mb-0">Total Game Dimainkan: <span className="fw-bold text-white">{totalGames}</span></h5>
                                <div className="d-flex gap-4 justify-content-center justify-content-md-start">
                                    <p className="mb-0 fs-5"><span className="text-success fw-bold">{overallStats.wins}</span> Menang</p>
                                    <p className="mb-0 fs-5"><span className="text-danger fw-bold">{overallStats.losses}</span> Kalah</p>
                                    <p className="mb-0 fs-5"><span className="text-muted fw-bold">{overallStats.draws}</span> Seri</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <h4 className="text-info mb-3">Rincian per Game</h4>
                    <div className="row g-4">
                        {(Object.keys(stats) as GameStatsID[]).map(gameId => {
                            const game = stats[gameId];
                            const gameTotal = game.wins + game.losses + game.draws;
                            const winRate = gameTotal > 0 ? Math.round((game.wins / gameTotal) * 100) : 0;
                            return (
                                <div className="col-md-6" key={gameId}>
                                    <div className="card bg-secondary text-light h-100 shadow">
                                        <div className="card-body">
                                            <h5 className="card-title text-info">{gameNames[gameId]}</h5>
                                            {gameTotal > 0 ? (
                                                <>
                                                    <p className="card-text mb-1">Total Dimainkan: {gameTotal}</p>
                                                    <p className="card-text mb-1">Menang: {game.wins}</p>
                                                    <p className="card-text mb-1">Kalah: {game.losses}</p>
                                                    <p className="card-text mb-3">Seri: {game.draws}</p>
                                                    <div className="progress" style={{ height: '20px' }}>
                                                        <div className="progress-bar bg-success" role="progressbar" style={{ width: `${winRate}%` }} aria-valuenow={winRate} aria-valuemin={0} aria-valuemax={100}>{winRate}%</div>
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="text-muted">Belum dimainkan.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    
                    <div className="text-center mt-5">
                        <button onClick={handleResetStats} className="btn btn-outline-danger">
                            Atur Ulang Semua Statistik
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default PlayerStats;
