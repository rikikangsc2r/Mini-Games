import React from 'react';
import { OnlinePlayer } from '../hooks/useOnlineGame';

interface PlayerDisplayProps {
    player: OnlinePlayer | null;
}

const PlayerDisplay: React.FC<PlayerDisplayProps> = ({ player }) => {
    if (!player) {
        return (
            <div className="d-flex align-items-center gap-2" style={{ minWidth: '120px' }}>
                <div className="spinner-grow spinner-grow-sm text-secondary" role="status">
                    <span className="visually-hidden">Menunggu...</span>
                </div>
            </div>
        );
    }
    return (
        <div className="d-flex align-items-center gap-2 text-decoration-none">
            <img src={player.avatarUrl} alt={player.name} className="player-avatar" />
            <span className="fw-bold text-light" style={{ fontSize: '1.1rem' }}>{player.name}</span>
        </div>
    );
};

export default PlayerDisplay;
