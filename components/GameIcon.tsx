import React from 'react';

interface GameIconProps {
  title: string;
  svgIcon: React.ReactNode;
  onClick: () => void;
}

const GameIcon: React.FC<GameIconProps> = ({ title, svgIcon, onClick }) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      onClick();
    }
  };

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      className="game-icon-container text-center text-decoration-none"
      aria-label={`Mulai game ${title}`}
    >
      <div className="game-icon-visual shadow-lg">
        {svgIcon}
      </div>
      <p className="game-icon-title mt-2 mb-0 fw-semibold">{title}</p>
    </div>
  );
};

export default GameIcon;
