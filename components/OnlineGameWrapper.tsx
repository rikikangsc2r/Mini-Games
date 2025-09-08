import React from 'react';
import PlayerDisplay from './PlayerDisplay';
import ChatAndEmotePanel from './ChatAndEmotePanel';
import InGameMessageDisplay from './InGameMessageDisplay';
import type { OnlinePlayer, ChatMessage } from '../hooks/useOnlineGame';
import type { Player } from '../types';

interface OnlineGameWrapperProps {
    myPlayer: OnlinePlayer | null;
    opponent: OnlinePlayer | null;
    mySymbol: Player | null;
    
    // Custom content slots
    opponentSideContent?: React.ReactNode;
    mySideContent?: React.ReactNode;

    // Game state
    roomId: string;
    statusMessage: string;
    isMyTurn: boolean;
    isGameOver: boolean;
    
    // Rematch logic
    rematchCount: number;
    amIReadyForRematch: boolean;
    onRematch: () => void;
    
    // Chat logic
    chatMessages: ChatMessage[];
    onSendMessage: (type: 'emote' | 'quickchat', content: string) => void;
    
    children: React.ReactNode;
}

const OnlineGameWrapper: React.FC<OnlineGameWrapperProps> = ({
    myPlayer,
    opponent,
    mySymbol,
    opponentSideContent,
    mySideContent,
    roomId,
    statusMessage,
    isMyTurn,
    isGameOver,
    rematchCount,
    amIReadyForRematch,
    onRematch,
    chatMessages,
    onSendMessage,
    children,
}) => {
    return (
        <div className="d-flex flex-column align-items-center gap-3 w-100 position-relative">
            {/* Opponent Display */}
            <div className="align-self-stretch d-flex justify-content-center">
               {opponentSideContent !== undefined ? opponentSideContent : <PlayerDisplay player={opponent} />}
            </div>

            {/* Game Status */}
            <div className="text-center">
                <p className="text-muted mb-0">Room: {roomId}</p>
                <p className={`mt-1 fs-4 fw-semibold ${isGameOver ? 'text-success' : 'text-light'}`}>
                    {statusMessage}
                </p>
            </div>

            {/* Game Board */}
            <div className="position-relative">
                {children}
                 <InGameMessageDisplay
                    messages={chatMessages}
                    players={{ [mySymbol!]: myPlayer, [(mySymbol === 'X' ? 'O' : 'X') as Player]: opponent }}
                    myPlayerSymbol={mySymbol}
                />
            </div>
            
            {/* My Display */}
             <div className="align-self-stretch d-flex justify-content-center">
               {mySideContent !== undefined ? mySideContent : <PlayerDisplay player={myPlayer} />}
            </div>

            {/* Controls */}
            <ChatAndEmotePanel onSendMessage={onSendMessage} disabled={!isMyTurn} />

            {isGameOver && (
                <button
                    onClick={onRematch}
                    disabled={amIReadyForRematch}
                    className="mt-3 btn btn-primary btn-lg d-flex align-items-center gap-2"
                >
                    <i className="fas fa-redo"></i> Rematch ({rematchCount}/2)
                </button>
            )}
        </div>
    );
};

export default OnlineGameWrapper;
