import React from 'react';

interface OnlineGameSetupProps {
    onlineStep: 'name' | 'room';
    playerName: string;
    nameInputRef: React.RefObject<HTMLInputElement>;
    roomInputRef: React.RefObject<HTMLInputElement>;
    handleNameSubmit: () => void;
    handleEnterRoom: () => void;
    isLoading: boolean;
    error: string;
}

const OnlineGameSetup: React.FC<OnlineGameSetupProps> = ({
    onlineStep,
    playerName,
    nameInputRef,
    roomInputRef,
    handleNameSubmit,
    handleEnterRoom,
    isLoading,
    error,
}) => {
    if (onlineStep === 'name') {
        return (
            <div className="text-center col-md-8 col-lg-6 mx-auto">
                <h2 className="display-5 fw-bold text-white mb-4">Masukkan Namamu</h2>
                <div className="input-group">
                    <input ref={nameInputRef} type="text" className="form-control form-control-lg bg-secondary border-secondary text-light" placeholder="Nama Pemain" aria-label="Nama Pemain" />
                    <button onClick={handleNameSubmit} className="btn btn-info">Lanjut</button>
                </div>
                {error && <p className="text-danger mt-2">{error}</p>}
            </div>
        );
    }

    if (onlineStep === 'room') {
        return (
            <div className="text-center col-md-8 col-lg-6 mx-auto">
                <h2 className="display-5 fw-bold text-white mb-3">Selamat Datang, {playerName}!</h2>
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
