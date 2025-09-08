import React from 'react';

interface BackButtonProps {
    onClick: () => void;
}

const BackButton: React.FC<BackButtonProps> = ({ onClick }) => {
    return (
        <button
            onClick={onClick}
            className="btn btn-outline-info position-absolute top-0 start-0 m-3 z-1 d-flex align-items-center gap-2"
            aria-label="Kembali"
        >
            <i className="fas fa-arrow-left"></i> Kembali
        </button>
    );
};

export default BackButton;