import React from 'react';

interface GameLobbyProps {
    roomId: string;
}

const GameLobby: React.FC<GameLobbyProps> = ({ roomId }) => (
    <div className="text-center">
        <h2 className="display-5 fw-bold text-white mb-3">Room: {roomId}</h2>
        <p className="fs-5 text-muted">Bagikan nama room ini ke temanmu</p>
        <div className="my-4 d-flex justify-content-center align-items-center gap-2">
            <div className="spinner-border text-warning" role="status">
                <span className="visually-hidden">Loading...</span>
            </div>
            <p className="fs-4 text-warning m-0">Menunggu pemain lain...</p>
        </div>
    </div>
);

export default GameLobby;
