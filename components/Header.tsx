import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="text-center">
      <h1 className="display-3 fw-bolder gradient-text">
        NkGame
      </h1>
      <p className="mt-2 fs-5 text-muted">Koleksi Game Klasik, Kesenangan Modern</p>
    </header>
  );
};

export default Header;