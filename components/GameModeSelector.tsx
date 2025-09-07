import React from 'react';
import { GameMode } from '../hooks/useOnlineGame';

interface GameModeSelectorProps {
    title: string;
    changeGameMode: (mode: GameMode) => void;
}

const GameModeSelector: React.FC<GameModeSelectorProps> = ({ title, changeGameMode }) => (
    <div className="text-center">
        <h2 className="display-5 fw-bold text-white mb-5">{title}</h2>
        <div className="d-grid gap-3 col-sm-8 col-md-6 col-lg-4 mx-auto">
            <button onClick={() => changeGameMode('local')} className="btn btn-primary btn-lg">Mabar Lokal</button>
            <button onClick={() => changeGameMode('online')} className="btn btn-info btn-lg">Mabar Online</button>
        </div>
    </div>
);

export default GameModeSelector;
