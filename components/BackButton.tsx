import React from 'react';

interface BackButtonProps {
    onClick: () => void;
}

const BackButton: React.FC<BackButtonProps> = ({ onClick }) => {
    return (
        <button
            onClick={onClick}
            className="btn btn-outline-info position-absolute top-0 start-0 m-3 z-1"
            aria-label="Kembali"
        >
            &larr; Kembali
        </button>
    );
};

export default BackButton;
