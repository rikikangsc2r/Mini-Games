import React from 'react';
import BackButton from './BackButton';
import GameBoard from './GameBoard';

const Chess: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center position-relative" style={{minHeight: '80vh'}}>
      <BackButton onClick={onBack} />
      <div className="text-center mb-5">
        <h2 className="display-5 fw-bold text-white">Catur</h2>
      </div>
      
      <div className="position-relative shadow-lg">
        <GameBoard size={8} renderChessPattern={true} />
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
