import React from 'react';
import type { GameID } from '../types';

interface NavbarProps {
    activeView: GameID;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onNavigate: (view: GameID) => void;
}

const Navbar: React.FC<NavbarProps> = ({ activeView, searchQuery, onSearchChange, onNavigate }) => {
    // Search bar hanya muncul di menu game utama
    const showSearchBar = activeView === 'menu';

    return (
        <nav className="navbar navbar-expand-md navbar-dark bg-dark sticky-top shadow-sm mb-4">
            <div className="container-fluid px-md-5">
                <a className="navbar-brand fw-bolder gradient-text fs-4" href="#" onClick={(e) => { e.preventDefault(); onNavigate('menu'); }}>
                    NkGame
                </a>
                <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNavbar" aria-controls="mainNavbar" aria-expanded="false" aria-label="Toggle navigation">
                    <span className="navbar-toggler-icon"></span>
                </button>
                <div className="collapse navbar-collapse" id="mainNavbar">
                    <ul className="navbar-nav me-auto mb-2 mb-md-0">
                        <li className="nav-item">
                            <a className={`nav-link ${activeView === 'menu' ? 'active' : ''}`} href="#" onClick={(e) => { e.preventDefault(); onNavigate('menu'); }}>Games</a>
                        </li>
                        <li className="nav-item">
                            <a className={`nav-link ${activeView === 'stats' ? 'active' : ''}`} href="#" onClick={(e) => { e.preventDefault(); onNavigate('stats'); }}>Statistik</a>
                        </li>
                        <li className="nav-item">
                            <a className={`nav-link ${activeView === 'blog' ? 'active' : ''}`} href="#" onClick={(e) => { e.preventDefault(); onNavigate('blog'); }}>Blog</a>
                        </li>
                    </ul>
                    {showSearchBar && (
                        <div className="d-flex search-bar-nav">
                            <div className="input-group">
                               <span className="input-group-text bg-secondary border-secondary" id="basic-addon1"><i className="fas fa-search text-muted"></i></span>
                                <input
                                    type="search"
                                    className="form-control bg-secondary border-secondary text-light"
                                    placeholder="Cari game..."
                                    value={searchQuery}
                                    onChange={(e) => onSearchChange(e.target.value)}
                                    aria-label="Cari Game"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
