import React from 'react';
import BackButton from './BackButton';

const ChessSquare: React.FC<{ isLight: boolean }> = ({ isLight }) => {
  const bgColor = isLight ? '#adb5bd' : '#495057';
  return <div style={{ width: 'clamp(40px, 10vw, 60px)', height: 'clamp(40px, 10vw, 60px)', backgroundColor: bgColor }}></div>;
};

const Chess: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const renderBoard = () => {
    const board = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        board.push(<ChessSquare key={`${i}-${j}`} isLight={(i + j) % 2 !== 0} />);
      }
    }
    return board;
  };

  return (
    <div className="d-flex flex-column align-items-center justify-content-center position-relative" style={{minHeight: '80vh'}}>
      <BackButton onClick={onBack} />
      <div className="text-center mb-5">
        <h2 className="display-5 fw-bold text-white">Catur</h2>
      </div>
      
      <div className="position-relative shadow-lg">
        <div className="border border-4 border-secondary" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)' }}>{renderBoard()}</div>
        <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{backgroundColor: 'rgba(0,0,0,0.7)'}}>
             <h3 className="fs-2 fw-bolder text-white p-4 border border-4 border-dashed border-info" style={{ transform: 'rotate(-6deg)'}}>
                SEGERA HADIR!
             </h3>
        </div>
      </div>
    </div>
  );
};

export default Chess;
