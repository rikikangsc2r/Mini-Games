import React from 'react';
import BackButton from './BackButton';

const GobbletPiece: React.FC<{ size: number; color: string }> = ({ size, color }) => {
    const sizeClasses = ['40px', '55px', '70px'];
    const borderClasses = ['4px', '6px', '8px'];
    return (
        <div 
            className={`rounded-circle d-flex align-items-center justify-content-center`}
            style={{ 
                width: sizeClasses[size-1], 
                height: sizeClasses[size-1], 
                border: `${borderClasses[size-1]} solid ${color}` 
            }}
        >
            <div className="rounded-circle" style={{width: '33%', height: '33%', backgroundColor: '#212529'}}></div>
        </div>
    );
};

const PlayerPieces: React.FC<{ color: string, colorName: string }> = ({ color, colorName }) => (
    <div className="d-flex flex-column align-items-center p-3 bg-secondary rounded-3">
        <h3 className="fw-bold fs-5">{colorName}</h3>
        <div className="d-flex gap-2 align-items-end mt-2">
            <div className="d-flex flex-column gap-2">
                <GobbletPiece size={3} color={color} />
                <GobbletPiece size={3} color={color} />
            </div>
            <div className="d-flex flex-column gap-2">
                <GobbletPiece size={2} color={color} />
                <GobbletPiece size={2} color={color} />
            </div>
            <div className="d-flex flex-column gap-2">
                <GobbletPiece size={1} color={color} />
                <GobbletPiece size={1} color={color} />
            </div>
        </div>
    </div>
)

const GobbletGobblers: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center position-relative" style={{minHeight: '80vh'}}>
      <BackButton onClick={onBack} />
      <div className="text-center mb-5">
        <h2 className="display-5 fw-bold text-white">Gobblet Gobblers</h2>
      </div>

      <div className="d-flex flex-column flex-lg-row align-items-center gap-4">
        <PlayerPieces color="#0dcaf0" colorName="Pemain 1" />

        <div className="p-3 rounded-3 shadow-lg position-relative" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', backgroundColor: '#000' }}>
            {Array.from({ length: 9 }).map((_, index) => (
                <div key={index} className="bg-secondary rounded-3" style={{ width: '100px', height: '100px' }}>
                </div>
            ))}
            <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center rounded-3" style={{backgroundColor: 'rgba(0,0,0,0.7)'}}>
                <h3 className="fs-2 fw-bolder text-white p-3 border border-4 border-dashed border-warning" style={{ transform: 'rotate(-6deg)'}}>
                    SEGERA HADIR!
                </h3>
            </div>
        </div>

         <PlayerPieces color="#ffc107" colorName="Pemain 2" />
      </div>
    </div>
  );
};

export default GobbletGobblers;