import React, { useState, useEffect, useRef } from 'react';

interface ChatAndEmotePanelProps {
    onSendMessage: (type: 'emote' | 'quickchat', content: string) => void;
    disabled: boolean;
}

const EMOTES = ['😊', '😂', '👍', '🤔', '🎉', '😢'];
const QUICK_CHATS = ['Good Game', 'Nice Move!', 'Thinking...', 'Good Luck!', 'Oops!'];

const ChatAndEmotePanel: React.FC<ChatAndEmotePanelProps> = ({ onSendMessage, disabled }) => {
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'emotes' | 'chat'>('emotes');
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                setIsPanelOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Jika bukan giliran kita dan tab obrolan terbuka, alihkan ke emote
    useEffect(() => {
        if (disabled && activeTab === 'chat') {
            setActiveTab('emotes');
        }
    }, [disabled, activeTab]);
    
    const handleSend = (type: 'emote' | 'quickchat', content: string) => {
        onSendMessage(type, content);
        setIsPanelOpen(false);
    };

    return (
        <div ref={panelRef} className="chat-panel-container">
            {isPanelOpen && (
                <div className="chat-popup">
                    <div className="btn-group w-100" role="group">
                        <button
                            type="button"
                            className={`btn btn-sm ${activeTab === 'emotes' ? 'btn-info' : 'btn-outline-info'}`}
                            onClick={() => setActiveTab('emotes')}
                        >
                            Emotes
                        </button>
                        <button
                            type="button"
                            className={`btn btn-sm ${activeTab === 'chat' ? 'btn-info' : 'btn-outline-info'}`}
                            onClick={() => setActiveTab('chat')}
                            disabled={disabled}
                        >
                            Chat
                        </button>
                    </div>
                    {activeTab === 'emotes' ? (
                        <div className="emote-grid">
                            {EMOTES.map(emote => (
                                <button key={emote} className="emote-btn" onClick={() => handleSend('emote', emote)}>
                                    {emote}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="d-flex flex-column gap-2">
                             {QUICK_CHATS.map(chat => (
                                <button key={chat} className="quick-chat-btn" onClick={() => handleSend('quickchat', chat)}>
                                    {chat}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <button
                className="btn btn-secondary btn-lg rounded-circle"
                onClick={() => setIsPanelOpen(prev => !prev)}
                aria-label="Buka obrolan dan emote"
            >
                💬
            </button>
        </div>
    );
};

export default ChatAndEmotePanel;