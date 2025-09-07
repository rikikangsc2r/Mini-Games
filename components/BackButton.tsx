import React from 'react';

const BackButton: React.FC = () => (
    <a
        href="#"
        className="btn btn-outline-info position-absolute top-0 start-0 m-3 z-1"
        aria-label="Kembali ke Menu"
    >
        &larr; Kembali ke Menu
    </a>
);

export default BackButton;