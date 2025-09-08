import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="text-center text-muted py-4 mt-5">
      <p className="mb-1">&copy; {new Date().getFullYear()} NkGame by NirKyy. All Rights Reserved.</p>
      <p className="mb-0">
        Contact Owner:{' '}
        <a href="https://wa.me/6283894391287" target="_blank" rel="noopener noreferrer" className="d-inline-flex align-items-center gap-2">
          <i className="fab fa-whatsapp"></i> WhatsApp
        </a>
      </p>
    </footer>
  );
};

export default Footer;