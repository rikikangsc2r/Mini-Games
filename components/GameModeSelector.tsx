import React from 'react';
import { GameMode } from '../types';

interface GameModeSelectorProps {
    title: string;
    description: string;
    changeGameMode: (mode: GameMode) => void;
}

const GameModeSelector: React.FC<GameModeSelectorProps> = ({ title, description, changeGameMode }) => (
    <div className="text-center">
        <h2 className="display-5 fw-bold text-white mb-3">{title}</h2>
        <p className="fs-5 text-muted col-md-10 col-lg-8 mx-auto mb-5">{description}</p>
        <div className="d-grid gap-3 col-sm-8 col-md-6 col-lg-4 mx-auto">
            <button onClick={() => changeGameMode('ai')} className="btn btn-success btn-lg">VS AI</button>
            <button onClick={() => changeGameMode('local')} className="btn btn-primary btn-lg">Mabar Lokal</button>
            <button onClick={() => changeGameMode('online')} className="btn btn-info btn-lg">Mabar Online</button>
        </div>
    </div>
);

export default GameModeSelector;
