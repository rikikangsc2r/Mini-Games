import React, { useState, useCallback, useEffect, Suspense } from 'react';
import type { GameID } from './types';
import GameCard from './components/GameCard';
import Header from './components/Header';
import useSounds from './components/useSounds';

// Lazy load game components for code-splitting
const TicTacToe = React.lazy(() => import('./components/TicTacToe'));
const GobbletGobblers = React.lazy(() => import('./components/GobbletGobblers'));
const Chess = React.lazy(() => import('./components/Chess'));
const Connect4 = React.lazy(() => import('./components/Connect4'));

const TicTacToeIcon = () => (
  <svg viewBox="0 0 100 100" style={{ width: '100%', height: 'auto', padding: '1rem', maxHeight: '150px' }}>
    <path d="M33,5 V95 M67,5 V95 M5,33 H95 M5,67 H95" stroke="#495057" strokeWidth="8" />
    <path d="M10,10 L30,30 M10,30 L30,10" stroke="#0dcaf0" strokeWidth="10" strokeLinecap="round" />
    <circle cx="50" cy="50" r="10" stroke="#ffc107" strokeWidth="10" fill="none" />
  </svg>
);

const GobbletIcon = () => (
  <svg viewBox="0 0 100 100" style={{ width: '100%', height: 'auto', padding: '1rem', maxHeight: '150px' }}>
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
  <svg viewBox="0 0 48 48" style={{ width: '100%', height: 'auto', padding: '1rem', maxHeight: '150px' }}>
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
    <svg viewBox="0 0 70 60" style={{ width: '100%', height: 'auto', padding: '1rem', maxHeight: '150px' }}>
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

const getGameFromHash = (): GameID => {
    const hash = window.location.hash.replace('#', '');
    const validGames: GameID[] = ['tictactoe', 'gobblet', 'chess', 'connect4'];
    if (validGames.includes(hash as GameID)) {
        return hash as GameID;
    }
    return 'menu';
}

const App: React.FC = () => {
  const [currentGame, setCurrentGame] = useState<GameID>(getGameFromHash);
  const playSound = useSounds();
  
  // Listen to hash changes to navigate
  useEffect(() => {
    const handleHashChange = () => {
        const newGame = getGameFromHash();
        if (newGame === 'menu' && currentGame !== 'menu') playSound('back');
        setCurrentGame(newGame);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [playSound, currentGame]);

  // SEO: Dynamically update page title
  useEffect(() => {
    switch (currentGame) {
      case 'tictactoe':
        document.title = 'Tic-Tac-Toe Multiplayer | NkGame';
        break;
      case 'gobblet':
        document.title = 'Gobblet Gobblers Multiplayer | NkGame';
        break;
      case 'chess':
        document.title = 'Catur (Chess) Multiplayer | NkGame';
        break;
      case 'connect4':
        document.title = 'Connect 4 Multiplayer | NkGame';
        break;
      default:
        document.title = 'NkGame - Koleksi Game Papan Online Multiplayer';
    }
  }, [currentGame]);

  const renderGame = () => {
    switch (currentGame) {
      case 'tictactoe':
        return <TicTacToe />;
      case 'gobblet':
        return <GobbletGobblers />;
      case 'chess':
        return <Chess />;
      case 'connect4':
        return <Connect4 />;
      default:
        return null;
    }
  };

  const SuspenseFallback = () => (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
        <div className="spinner-border text-info" style={{ width: '3rem', height: '3rem' }} role="status">
            <span className="visually-hidden">Memuat Game...</span>
        </div>
    </div>
  );

  return (
    <div className="min-vh-100 p-3 p-sm-4 p-md-5">
      <Header />
      <main className="container mt-5">
        {currentGame === 'menu' ? (
          <div className="row g-4 justify-content-center">
            <div className="col-12 col-md-6 col-lg-6">
              <GameCard
                title="Tic-Tac-Toe"
                description="Permainan klasik X dan O. Tantang teman dalam duel dua pemain yang sederhana namun strategis ini."
                svgIcon={<TicTacToeIcon />}
                href="#tictactoe"
                onClick={() => playSound('select')}
              />
            </div>
            <div className="col-12 col-md-6 col-lg-6">
              <GameCard
                title="Gobblet Gobblers"
                description="Sentuhan cerdas pada Tic-Tac-Toe. Makan jalanmu menuju kemenangan dalam permainan dua pemain yang seru ini!"
                svgIcon={<GobbletIcon />}
                href="#gobblet"
                onClick={() => playSound('select')}
              />
            </div>
            <div className="col-12 col-md-6 col-lg-6">
              <GameCard
                title="Catur"
                description="Permainan strategi terbaik. Uji kecerdasan Anda melawan lawan dalam pertarungan abadi yang mengasah otak."
                svgIcon={<ChessIcon />}
                href="#chess"
                onClick={() => playSound('select')}
              />
            </div>
            <div className="col-12 col-md-6 col-lg-6">
              <GameCard
                title="Connect 4"
                description="Jatuhkan cakram Anda dan jadilah yang pertama mendapatkan empat cakram berturut-turut. Bisakah Anda mengakali lawan?"
                svgIcon={<Connect4Icon />}
                href="#connect4"
                onClick={() => playSound('select')}
              />
            </div>
          </div>
        ) : (
          <Suspense fallback={<SuspenseFallback />}>
            {renderGame()}
          </Suspense>
        )}
      </main>
    </div>
  );
};

export default App;