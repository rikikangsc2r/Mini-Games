import React, { useState, useRef, useEffect } from 'react';
import type { PlayerProfile } from '../hooks/useOnlineGame';
import { useAvatars } from '../hooks/useAvatars';

interface OnlineGameSetupProps {
    onlineStep: 'profile' | 'room';
    playerProfile: PlayerProfile | null;
    roomInputRef: React.RefObject<HTMLInputElement>;
    handleProfileSubmit: (name: string, avatarUrl: string) => void;
    handleEnterRoom: () => void;
    isLoading: boolean;
    error: string;
    handleChangeProfileRequest: () => void;
}

const OnlineGameSetup: React.FC<OnlineGameSetupProps> = ({
    onlineStep,
    playerProfile,
    roomInputRef,
    handleProfileSubmit,
    handleEnterRoom,
    isLoading,
    error,
    handleChangeProfileRequest,
}) => {
    const [selectedAvatar, setSelectedAvatar] = useState<string>('');
    const nameInputRef = useRef<HTMLInputElement>(null);
    const { avatars, loading: avatarsLoading, error: avatarsError } = useAvatars();

    useEffect(() => {
        // Secara manual mengosongkan input room saat komponen beralih ke langkah 'room'
        // untuk mencegah browser mengisinya dengan nama pemain.
        if (onlineStep === 'room' && roomInputRef.current) {
            roomInputRef.current.value = '';
        }
    }, [onlineStep, roomInputRef]);

    const handleSubmit = () => {
        const name = nameInputRef.current?.value.trim();
        if (name && selectedAvatar) {
            handleProfileSubmit(name, selectedAvatar);
        }
    };

    const handleAvatarKeyDown = (e: React.KeyboardEvent, url: string) => {
        if (e.key === 'Enter' || e.key === ' ') {
            setSelectedAvatar(url);
        }
    };

    if (onlineStep === 'profile') {
        return (
            <div className="text-center col-md-8 col-lg-6 mx-auto">
                <h2 className="display-5 fw-bold text-white mb-4">Buat Profil Pemain</h2>
                <div className="mb-4">
                    <p className="text-muted">Pilih Avatarmu</p>
                    {avatarsLoading && <div className="spinner-border text-info" role="status"><span className="visually-hidden">Loading...</span></div>}
                    {avatarsError && <p className="text-danger">{avatarsError}</p>}
                    {!avatarsLoading && !avatarsError && (
                         <div className="avatar-selection-grid">
                            {avatars.map(({ name, url }) => (
                                <div
                                    key={name}
                                    className={`avatar-choice ${selectedAvatar === url ? 'selected' : ''}`}
                                    onClick={() => setSelectedAvatar(url)}
                                    onKeyDown={(e) => handleAvatarKeyDown(e, url)}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Pilih avatar ${name}`}
                                    aria-pressed={selectedAvatar === url}
                                >
                                    <img src={url} alt={name} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="input-group mb-3">
                    <input ref={nameInputRef} type="text" className="form-control form-control-lg bg-secondary border-secondary text-light" placeholder="Nama Pemain" aria-label="Nama Pemain" />
                </div>
                 <button onClick={handleSubmit} disabled={!selectedAvatar || avatarsLoading} className="btn btn-info btn-lg">
                    Simpan & Lanjut
                </button>
                {error && <p className="text-danger mt-2">{error}</p>}
            </div>
        );
    }

    if (onlineStep === 'room' && playerProfile) {
        return (
            <div className="text-center col-md-8 col-lg-6 mx-auto">
                <div className="d-flex flex-column align-items-center mb-3">
                    <img src={playerProfile.avatarUrl} alt="Your Avatar" className="player-avatar mb-2" style={{width: '80px', height: '80px'}}/>
                    <h2 className="display-5 fw-bold text-white">
                        {playerProfile.name}
                    </h2>
                     <button 
                        onClick={handleChangeProfileRequest} 
                        className="btn btn-link btn-sm text-info p-1" 
                        aria-label="Ganti profil"
                    >
                        (Ganti Profil)
                    </button>
                </div>

                <p className="fs-5 text-muted mb-4">Masukkan nama room untuk bermain.</p>
                <div className="input-group">
                    <input ref={roomInputRef} type="text" className="form-control form-control-lg bg-secondary border-secondary text-light" placeholder="Nama Room" aria-label="Nama Room" />
                    <button onClick={handleEnterRoom} disabled={isLoading} className="btn btn-info">
                        {isLoading ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> : 'Masuk'}
                    </button>
                </div>
                {error && <p className="text-danger mt-2">{error}</p>}
            </div>
        );
    }
    
    return null;
};

export default OnlineGameSetup;