import React from 'react';

interface GameCardProps {
  title: string;
  description: string;
  svgIcon: React.ReactNode;
  href: string;
  onClick: () => void;
}

const GameCard: React.FC<GameCardProps> = ({ title, description, svgIcon, href, onClick }) => {
  return (
    <a
      href={href}
      onClick={onClick}
      className="card bg-secondary h-100 card-hover shadow text-decoration-none"
    >
      <div className="card-img-top bg-dark d-flex justify-content-center align-items-center" style={{ minHeight: '180px' }}>
        {svgIcon}
      </div>
      <div className="card-body">
        <h2 className="card-title h3 text-info">{title}</h2>
        <p className="card-text text-light">{description}</p>
      </div>
    </a>
  );
};

export default GameCard;