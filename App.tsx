import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { GameID } from './types';
import useSounds from './components/useSounds';

// Impor komponen baru
import Navbar from './components/Navbar';
import GameIcon from './components/GameIcon';

// Impor komponen game dan halaman
import TicTacToe from './components/TicTacToe';
import GobbletGobblers from './components/GobbletGobblers';
import Chess from './components/Chess';
import Connect4 from './components/Connect4';
import Crossword from './components/Crossword';
import Footer from './components/Footer';
import Blog from './components/Blog';
import PlayerStats from './components/PlayerStats';

// Ikon-ikon Game
const TicTacToeIcon = () => (
  <svg viewBox="0 0 100 100">
    <path d="M33,5 V95 M67,5 V95 M5,33 H95 M5,67 H95" stroke="#495057" strokeWidth="8" />
    <path d="M10,10 L30,30 M10,30 L30,10" stroke="#0dcaf0" strokeWidth="10" strokeLinecap="round" />
    <circle cx="50" cy="50" r="10" stroke="#ffc107" strokeWidth="10" fill="none" />
  </svg>
);

const GobbletIcon = () => (
  <svg viewBox="0 0 100 100">
     <g stroke="#343a40" strokeWidth="2">
      <circle cx="45" cy="55" r="35" fill="#0dcaf0" opacity="0.3" />
      <circle cx="45" cy="55" r="28" fill="#0dcaf0" opacity="0.6" />
      <circle cx="45" cy="55" r="20" fill="#0dcaf0" />
      <circle cx="70" cy="35" r="25" fill="#ffc107" opacity="0.3" />
      <circle cx="70" cy="35" r="20" fill="#ffc107" opacity="0.6" />
      <circle cx="70" cy="35" r="15" fill="#ffc107" />
     </g>
  </svg>
);

const ChessIcon = () => (
  <svg viewBox="0 0 48 48">
    <g stroke="#212529" strokeWidth="0.5">
      <path fill="#689f38" d="M28.001,19h-8.002c0,16.944-10,9.713-10,23c0,0,0.546,2,14.001,2c13.455,0,14.001-2,14.001-2 C38.001,28.713,28.001,35.944,28.001,19z"></path>
      <path fill="#33691e" d="M28.001,19h-8.002c0,1.127-0.047,2.141-0.13,3.067c1.869,0.18,5.76,0.63,5.76,3.765 C25.629,28.534,23.891,37.51,19,38c-4.461,0.447-8.273-1.094-8.273-1.094C10.272,38.18,9.999,39.81,9.999,42c0,0,0.546,2,14.001,2 c13.455,0,14.001-2,14.001-2C38.001,28.713,28.001,35.944,28.001,19z"></path>
      <path fill="#689f38" d="M26.02,14H24h-2.02c-1.986,1.334-3.972,2.668-5.957,4.001c0.03,0.428,0.113,0.997,0.332,1.634 c0.197,0.573,0.446,1.032,0.663,1.371l6.984-0.01l6.981,0.01c0.217-0.339,0.466-0.798,0.663-1.371 c0.219-0.637,0.302-1.206,0.332-1.634C29.992,16.668,28.006,15.334,26.02,14z"></path>
      <path fill="#33691e" d="M26,20.999l1.084,0.483l0.976-0.48l2.922,0.004c0.217-0.339,0.466-0.798,0.663-1.371 c0.219-0.637,0.302-1.206,0.332-1.634c-1.986-1.334-3.972-2.668-5.957-4.001H24l3,4L26,20.999z"></path>
      <circle cx="24" cy="10" r="7" fill="#689f38"></circle>
      <path fill="#33691e" d="M27.884,4.178c0.743,1.112,1.178,2.447,1.178,3.884c0,3.016-1.907,5.586-4.581,6.571l1.544,2.07 c0.435-0.131,1.04,0.059,1.434-0.15c0.361-0.191,0.515-0.775,0.835-1.024C29.94,14.249,31,12.248,31,10 C31,7.571,29.762,5.433,27.884,4.178z"></path>
      <path fill="#9ccc65" d="M24.683,4.727c0.372,0.973-0.526,2.556-2.006,3.536c-1.48,0.979-2.982,0.984-3.354,0.011 s0.526-2.556,2.006-3.536S24.31,3.753,24.683,4.727z"></path>
    </g>
  </svg>
);

const Connect4Icon = () => (
    <svg viewBox="0 0 70 60">
      <defs>
        <mask id="connect4-mask">
          <rect width="70" height="60" fill="white"/>
          {[...Array(6)].map((_, r) =>
            [...Array(7)].map((_, c) =>
              <circle key={`${r}-${c}`} cx={5 + c * 10} cy={5 + r * 10} r="4.5" fill="black"/>
            )
          )}
        </mask>
      </defs>
      <rect width="70" height="60" rx="5" fill="#0d6efd"/>
      <rect width="70" height="60" rx="5" fill="#212529" mask="url(#connect4-mask)"/>
      <circle cx="15" cy="55" r="4.5" fill="#ffc107"/>
      <circle cx="25" cy="55" r="4.5" fill="#ffc107"/>
      <circle cx="35" cy="45" r="4.5" fill="#ffc107"/>
      <circle cx="45" cy="35" r="4.5" fill="#ffc107"/>
      <circle cx="25" cy="45" r="4.5" fill="#dc3545"/>
      <circle cx="35" cy="55" r="4.5" fill="#dc3545"/>
      <circle cx="45" cy="45" r="4.5" fill="#dc3545"/>
    </svg>
);

const CrosswordIcon = () => (
  <svg viewBox="0 0 100 100">
    <rect x="20" y="20" width="60" height="60" rx="5" fill="#495057" />
    <path d="M30 50h40 M50 30v40" stroke="#212529" strokeWidth="8"/>
    <text x="32" y="48" fill="#0dcaf0" fontSize="20" fontFamily="sans-serif" fontWeight="bold">T</text>
    <text x="52" y="48" fill="#f8f9fa" fontSize="20" fontFamily="sans-serif" fontWeight="bold">E</text>
    <text x="42" y="68" fill="#f8f9fa" fontSize="20" fontFamily="sans-serif" fontWeight="bold">K</text>
    <text x="42" y="28" fill="#ffc107" fontSize="20" fontFamily="sans-serif" fontWeight="bold">A</text>
  </svg>
);


const App: React.FC = () => {
  const [currentGame, setCurrentGame] = useState<GameID>('menu');
  const [searchQuery, setSearchQuery] = useState('');
  const scrollPositionRef = useRef(0);
  const playSound = useSounds();
  
  const handleSelectGame = useCallback((gameId: GameID) => {
    if (currentGame === 'menu') {
        scrollPositionRef.current = window.scrollY;
    }
    playSound('select');
    setCurrentGame(gameId);
  }, [currentGame, playSound]);
  
  const handleBackToMenu = useCallback(() => {
      playSound('back');
      setCurrentGame('menu');
  }, [playSound]);

  useEffect(() => {
    if (currentGame === 'menu') {
        const timer = setTimeout(() => {
            window.scrollTo({ top: scrollPositionRef.current, behavior: 'auto' });
        }, 0);
        return () => clearTimeout(timer);
    } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [currentGame]);

  useEffect(() => {
    switch (currentGame) {
      case 'tictactoe': document.title = 'Tic-Tac-Toe Multiplayer | NkGame'; break;
      case 'gobblet': document.title = 'Gobblet Gobblers Multiplayer | NkGame'; break;
      case 'chess': document.title = 'Catur (Chess) Multiplayer | NkGame'; break;
      case 'connect4': document.title = 'Connect 4 Multiplayer | NkGame'; break;
      case 'crossword': document.title = 'Teka Teki Lontong | NkGame'; break;
      case 'stats': document.title = 'Statistik Pemain | NkGame'; break;
      case 'blog': document.title = 'Blog | NkGame'; break;
      default: document.title = 'NkGame - Koleksi Game Papan Online Multiplayer';
    }
  }, [currentGame]);

  const gamesList = [
    {
        id: 'tictactoe' as GameID,
        title: "Tic-Tac-Toe",
        description: "Permainan klasik X dan O. Tantang teman dalam duel dua pemain yang sederhana namun strategis ini.",
        icon: <TicTacToeIcon />,
    },
    {
        id: 'gobblet' as GameID,
        title: "Gobblet Gobblers",
        description: "Sentuhan cerdas pada Tic-Tac-Toe. Makan jalanmu menuju kemenangan dalam permainan dua pemain yang seru ini!",
        icon: <GobbletIcon />,
    },
    {
        id: 'chess' as GameID,
        title: "Catur",
        description: "Permainan strategi terbaik. Uji kecerdasan Anda melawan lawan dalam pertarungan abadi yang mengasah otak.",
        icon: <ChessIcon />,
    },
    {
        id: 'connect4' as GameID,
        title: "Connect 4",
        description: "Jatuhkan cakram Anda dan jadilah yang pertama mendapatkan empat cakram berturut-turut. Bisakah Anda mengakali lawan?",
        icon: <Connect4Icon />,
    },
    {
        id: 'crossword' as GameID,
        title: "Teka Teki Lontong",
        description: "Teka-teki silang dengan jawaban nyeleneh dan tak terduga. Uji logika humorismu!",
        icon: <CrosswordIcon />,
    },
  ];

  const filteredGames = gamesList.filter(game =>
    game.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getGameDescription = (gameId: GameID) => {
      const game = gamesList.find(g => g.id === gameId);
      return game ? game.description : '';
  };

  const renderGame = () => {
    switch (currentGame) {
      case 'tictactoe': return <TicTacToe onBackToMenu={handleBackToMenu} description={getGameDescription('tictactoe')} />;
      case 'gobblet': return <GobbletGobblers onBackToMenu={handleBackToMenu} description={getGameDescription('gobblet')} />;
      case 'chess': return <Chess onBackToMenu={handleBackToMenu} description={getGameDescription('chess')} />;
      case 'connect4': return <Connect4 onBackToMenu={handleBackToMenu} description={getGameDescription('connect4')} />;
      case 'crossword': return <Crossword onBackToMenu={handleBackToMenu} />;
      case 'stats': return <PlayerStats onBackToMenu={handleBackToMenu} />;
      case 'blog': return <Blog onBackToMenu={handleBackToMenu} />;
      default: return null;
    }
  };

  const renderContent = () => {
      if (currentGame === 'menu') {
          return (
              <>
                <div className="text-center mb-5">
                  <h1 className="display-4 fw-bolder text-white">Pilih Game</h1>
                  <p className="fs-5 text-muted">Koleksi Game Klasik, Kesenangan Modern</p>
                </div>
                <div className="game-icon-grid">
                  {filteredGames.length > 0 ? filteredGames.map(game => (
                      <GameIcon
                          key={game.id}
                          title={game.title}
                          svgIcon={game.icon}
                          onClick={() => handleSelectGame(game.id)}
                      />
                  )) : (
                      <div className="text-center text-muted mt-4" style={{gridColumn: '1 / -1'}}>
                          <p className="fs-4">Tidak ada yang ditemukan.</p>
                          <p>Coba kata kunci pencarian yang berbeda.</p>
                      </div>
                  )}
                </div>
              </>
          );
      }
      return renderGame();
  };


  return (
    <div className="d-flex flex-column min-vh-100">
      <Navbar 
        activeView={currentGame}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNavigate={handleSelectGame}
      />
      <main className="container-fluid px-3 px-md-5 mt-4 flex-grow-1">
        {renderContent()}
      </main>
      <Footer />
    </div>
  );
};

export default App;