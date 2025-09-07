import React, { useState, useEffect, useRef } from 'react';
import type { PlayerProfile } from '../hooks/useOnlineGame';

const useAvatars = () => {
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchAvatars = async () => {
      try {
        const response = await fetch('https://raw.githubusercontent.com/rikikangsc2-eng/SVG-ICON/refs/heads/main/avatar.json');
        if (!response.ok) throw new Error('Gagal memuat avatar');
        const data = await response.json();
        if (isMounted) setAvatars(data);
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Terjadi kesalahan');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchAvatars();
    return () => { isMounted = false; };
  }, []);

  return { avatars, isLoading, error };
};


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
    const { avatars, isLoading: avatarsLoading, error: avatarsError } = useAvatars();
    const [selectedAvatar, setSelectedAvatar] = useState<string>('');
    const nameInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = () => {
        const name = nameInputRef.current?.value.trim();
        if (name && selectedAvatar) {
            handleProfileSubmit(name, selectedAvatar);
        }
    };

    if (onlineStep === 'profile') {
        return (
            <div className="text-center col-md-8 col-lg-6 mx-auto">
                <h2 className="display-5 fw-bold text-white mb-4">Buat Profil Pemain</h2>
                {avatarsLoading && <div className="spinner-border text-info my-4"></div>}
                {avatarsError && <p className="text-danger">{avatarsError}</p>}
                {!avatarsLoading && !avatarsError && (
                    <div className="mb-4">
                        <p className="text-muted">Pilih Avatarmu</p>
                        <div className="avatar-selection-grid">
                            {Object.entries(avatars).map(([key, url]) => (
                                <div
                                    key={key}
                                    className={`avatar-choice ${selectedAvatar === url ? 'selected' : ''}`}
                                    onClick={() => setSelectedAvatar(url)}
                                >
                                    <img src={url} alt={key} loading="lazy" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
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