import React from 'react';

interface RulesModalProps {
  title: string;
  show: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const RulesModal: React.FC<RulesModalProps> = ({ title, show, onClose, children }) => {
  if (!show) {
    return null;
  }

  // Effect to add class to body to prevent scrolling when modal is open
  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  return (
    <>
        <div className="modal-backdrop fade show" style={{ zIndex: 1050 }}></div>
        <div 
            className="modal fade show" 
            style={{ display: 'block', zIndex: 1055 }} 
            tabIndex={-1} 
            onClick={onClose} 
            role="dialog"
            aria-modal="true"
            aria-labelledby="rulesModalTitle"
        >
            <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable" onClick={e => e.stopPropagation()}>
                <div className="modal-content bg-secondary text-light">
                    <div className="modal-header border-bottom border-secondary-subtle">
                        <h5 className="modal-title text-info" id="rulesModalTitle">{title}</h5>
                        <button type="button" className="btn-close btn-close-white" aria-label="Close" onClick={onClose}></button>
                    </div>
                    <div className="modal-body" style={{ whiteSpace: 'pre-line' }}>
                        {children}
                    </div>
                    <div className="modal-footer border-top border-secondary-subtle">
                        <button type="button" className="btn btn-info" onClick={onClose}>Mengerti</button>
                    </div>
                </div>
            </div>
        </div>
    </>
  );
};

export default RulesModal;
