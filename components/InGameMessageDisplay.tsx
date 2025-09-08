import React from 'react';
import type { Player } from '../types';
import { OnlinePlayer, ChatMessage } from '../hooks/useOnlineGame';

interface InGameMessageDisplayProps {
    messages: ChatMessage[];
    players: { [key in Player]?: OnlinePlayer | null };
    myPlayerSymbol: Player | null;
}

const InGameMessageDisplay: React.FC<InGameMessageDisplayProps> = ({ messages, players, myPlayerSymbol }) => {
    const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

    if (!latestMessage) {
        return null;
    }

    // Tentukan apakah pesan ini dari pemain saat ini atau lawan.
    const isMyMessage = latestMessage.senderSymbol === myPlayerSymbol;
    
    // Pesan pemain saat ini selalu di bagian bawah, pesan lawan selalu di bagian atas.
    const positionStyle: React.CSSProperties = isMyMessage
        ? { bottom: '20px' } // Pesan saya di bawah
        : { top: '20px' };   // Pesan lawan di atas


    return (
        <div key={latestMessage.timestamp} className="ingame-message-display" style={positionStyle}>
            {latestMessage.type === 'emote' ? (
                <div className="ingame-emote">{latestMessage.content}</div>
            ) : (
                <div className="ingame-message-bubble">{latestMessage.content}</div>
            )}
        </div>
    );
};

export default InGameMessageDisplay;