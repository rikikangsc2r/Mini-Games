import React, { useState, useEffect } from 'react';
import type { Player } from '../types';
import { OnlinePlayer, ChatMessage } from '../hooks/useOnlineGame';

interface InGameMessageDisplayProps {
    messages: ChatMessage[];
    players: { X: OnlinePlayer | null; O: OnlinePlayer | null };
    myPlayerSymbol: Player | null;
}

const InGameMessageDisplay: React.FC<InGameMessageDisplayProps> = ({ messages, players, myPlayerSymbol }) => {
    const [latestMessage, setLatestMessage] = useState<ChatMessage | null>(null);

    useEffect(() => {
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            // Hanya perbarui jika timestamp-nya baru untuk mencegah re-render yang tidak perlu
            if (lastMsg.timestamp !== latestMessage?.timestamp) {
                 setLatestMessage(lastMsg);
            }
        }
    }, [messages]); // Hanya bergantung pada array pesan

    if (!latestMessage) {
        return null;
    }

    const isMyMessage = latestMessage.senderSymbol === myPlayerSymbol;
    // Tentukan posisi berdasarkan siapa yang mengirim pesan.
    // Dalam Gobblet/Catur, 'O' (lawan) ada di atas, 'X' (saya) ada di bawah.
    // Dalam TicTacToe/Connect4, 'X' di kiri, 'O' di kanan.
    // Logika ini mengasumsikan tata letak vertikal secara default, yang berfungsi baik untuk semua game.
    const positionStyle: React.CSSProperties = isMyMessage
        ? { bottom: '20px' }
        : { top: '20px' };


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
