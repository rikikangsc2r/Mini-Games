import React, { useState, useCallback, useEffect, useRef } from 'react';
import BackButton from './BackButton';
import { useOnlineGame, BaseOnlineGameState, OnlinePlayer } from '../hooks/useOnlineGame';
import OnlineGameSetup from './OnlineGameSetup';
import PlayerDisplay from './PlayerDisplay';
import GameLobby from './GameLobby';

// --- Type Definitions ---
// Fabric.js will be available on the global window object from the CDN
declare const fabric: any;

interface PathData {
  id: string;
  deviceId: string;
  // Fabric.js path object is serialized to a plain object for Firebase
  // We will store the fabric object's data here
  path: any; 
}

interface OnlineDrawingGameState extends BaseOnlineGameState {
  paths: { [id: string]: PathData };
}

// --- Firebase & Helper Functions ---
// FIX: Declare the global firebase object to resolve reference errors.
declare const firebase: any;
const db = firebase.database();
const getDeviceId = (): string => {
    let id = localStorage.getItem('deviceId');
    if (!id) {
        id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('deviceId', id);
    }
    return id;
};

// --- Game State Creation Functions ---
const createInitialOnlineState = (playerName: string, deviceId: string, avatarUrl: string): OnlineDrawingGameState => ({
    paths: {},
    currentPlayer: 'X', // Not used for turns, but required by base type
    winner: null,
    players: { X: { deviceId, name: playerName, avatarUrl }, O: null },
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    rematch: { X: false, O: false }, // Not used
    startingPlayer: 'X', // Not used
    chatMessages: [], // Not used
});

const reconstructOnlineState = (gameData: any): OnlineDrawingGameState => ({
    ...gameData,
    paths: gameData.paths || {},
    players: gameData.players || { X: null, O: null },
    rematch: gameData.rematch || { X: false, O: false },
    chatMessages: gameData.chatMessages || [],
});

// --- Constants ---
const COLORS = ['#FFFFFF', '#dc3545', '#ffc107', '#198754', '#0dcaf0', '#6f42c1', '#000000'];
const SIZES = [2, 5, 10, 20, 40];
const CANVAS_BACKGROUND_COLOR = '#212529';

interface DrawingGameProps {
  onBackToMenu: () => void;
  description: string;
}

const DrawingGame: React.FC<DrawingGameProps> = ({ onBackToMenu, description }) => {
    const {
        gameMode, onlineStep, playerProfile, roomId, onlineGameState,
        isLoading, error, roomInputRef, handleProfileSubmit,
        handleEnterRoom, changeGameMode, handleChangeProfileRequest,
    } = useOnlineGame('drawing-games', createInitialOnlineState, reconstructOnlineState, () => ({ paths: {} }), onBackToMenu);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricCanvasRef = useRef<any>(null); // To hold the fabric.Canvas instance
    const historyRef = useRef<string[]>([]); // For offline undo
    
    const [color, setColor] = useState('#FFFFFF');
    const [size, setSize] = useState(5);
    const [isErasing, setIsErasing] = useState(false);
    
    // --- Canvas Initialization and Management ---
    useEffect(() => {
        if (!canvasRef.current || gameMode === 'menu') return;

        const canvas = new fabric.Canvas(canvasRef.current, {
            isDrawingMode: true,
            backgroundColor: CANVAS_BACKGROUND_COLOR,
        });
        fabricCanvasRef.current = canvas;

        const resizeCanvas = () => {
             const { innerWidth, innerHeight } = window;
             canvas.setWidth(innerWidth);
             canvas.setHeight(innerHeight);
             canvas.renderAll();
        };
        
        window.addEventListener('resize', resizeCanvas);

        // Save initial state for offline undo
        if (gameMode === 'local') {
             historyRef.current = [JSON.stringify(canvas.toObject())];
        }

        const handlePathCreated = (e: any) => {
            const path = e.path;
            if (gameMode === 'online' && roomId) {
                const deviceId = getDeviceId();
                const pathId = `${deviceId}-${Date.now()}`;
                path.set('id', pathId); // Set a custom ID on the fabric object
                const pathData = path.toObject(['id']);
                db.ref(`drawing-games/${roomId}/paths/${pathId}`).set({
                    id: pathId,
                    deviceId,
                    path: pathData,
                });
            } else if (gameMode === 'local') {
                historyRef.current.push(JSON.stringify(canvas.toObject()));
            }
        };
        
        canvas.on('path:created', handlePathCreated);
        
        // Initial resize
        resizeCanvas();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            canvas.dispose();
            fabricCanvasRef.current = null;
        };
    }, [gameMode, roomId]);

    // Update brush properties when color, size, or eraser mode changes
    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (canvas) {
            canvas.freeDrawingBrush.color = isErasing ? CANVAS_BACKGROUND_COLOR : color;
            canvas.freeDrawingBrush.width = size;
        }
    }, [color, size, isErasing]);

    // --- Online State Synchronization ---
    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (gameMode !== 'online' || !canvas || !onlineGameState) return;

        const firebasePaths = onlineGameState.paths || {};
        const firebasePathIds = new Set(Object.keys(firebasePaths));

        // Handle the "clear all" event robustly and efficiently
        if (firebasePathIds.size === 0 && canvas.getObjects().length > 0) {
            canvas.clear();
            canvas.backgroundColor = CANVAS_BACKGROUND_COLOR;
            canvas.renderAll();
            return; // The canvas is now in sync with the empty state.
        }
        
        const canvasObjectsById = canvas.getObjects().reduce((acc: any, obj: any) => {
            if (obj.id) acc[obj.id] = obj;
            return acc;
        }, {});

        const pathsToEnliven: any[] = [];
        const idsOnCanvas = new Set(Object.keys(canvasObjectsById));

        // Find paths from Firebase to add to the canvas
        firebasePathIds.forEach(id => {
            if (!idsOnCanvas.has(id)) {
                 const pathData = firebasePaths[id as keyof typeof firebasePaths]?.path;
                 if (pathData) {
                    pathsToEnliven.push(pathData);
                 }
            }
        });

        // Find paths on the canvas to remove
        const pathsToRemove: any[] = [];
        idsOnCanvas.forEach(id => {
            if (!firebasePathIds.has(id)) {
                pathsToRemove.push(canvasObjectsById[id]);
            }
        });
        
        // Perform removals if any
        if (pathsToRemove.length > 0) {
            pathsToRemove.forEach(obj => canvas.remove(obj));
            canvas.renderAll();
        }

        // Perform additions if any
        if (pathsToEnliven.length > 0) {
            fabric.util.enlivenObjects(pathsToEnliven, (enlivenedObjects: any[]) => {
                enlivenedObjects.forEach(obj => {
                    canvas.add(obj);
                });
                canvas.renderAll();
            });
        }
    }, [onlineGameState?.paths, gameMode]);

    // --- Control Handlers ---
    const handleColorClick = (c: string) => {
        setColor(c);
        setIsErasing(false);
    };

    const handleEraserClick = () => {
        setIsErasing(true);
    };

    const handleUndo = () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        
        if (gameMode === 'local') {
            if (historyRef.current.length > 1) {
                historyRef.current.pop();
                const prevState = historyRef.current[historyRef.current.length - 1];
                canvas.loadFromJSON(prevState, canvas.renderAll.bind(canvas));
            }
        } else if (gameMode === 'online' && onlineGameState) {
            const myDeviceId = getDeviceId();
            const paths = onlineGameState.paths ? Object.values(onlineGameState.paths) : [];
            const myLastPath = paths
                .filter((p: PathData) => p.deviceId === myDeviceId)
                .sort((a, b) => parseInt(b.id.split('-')[1]) - parseInt(a.id.split('-')[1]))[0];
                
            if(myLastPath) {
                db.ref(`drawing-games/${roomId}/paths/${myLastPath.id}`).remove();
            }
        }
    };

    const handleClear = () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        if (window.confirm('Hapus seluruh kanvas? Tindakan ini tidak dapat diurungkan.')) {
            if (gameMode === 'local') {
                canvas.clear();
                canvas.backgroundColor = CANVAS_BACKGROUND_COLOR; // Re-apply background color
                canvas.renderAll(); // Explicitly render the cleared canvas
                historyRef.current = [JSON.stringify(canvas.toObject())];
            } else if (gameMode === 'online') {
                // Let Firebase be the source of truth. The client's useEffect will handle the update.
                db.ref(`drawing-games/${roomId}/paths`).set(null);
            }
        }
    };
    
    // --- Render Functions ---
    const renderDrawingInterface = () => (
      <>
        <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />
        <div 
          className="d-flex flex-wrap justify-content-center align-items-center gap-3 p-3 rounded-pill shadow-lg"
          style={{
            position: 'absolute',
            bottom: '2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            backgroundColor: 'rgba(40, 40, 40, 0.8)',
            backdropFilter: 'blur(5px)',
            border: '1px solid #495057'
          }}
        >
          <div className="d-flex gap-2" aria-label="Palet Warna">
            {COLORS.map(c => <button key={c} onClick={() => handleColorClick(c)} style={{backgroundColor: c, width: 30, height: 30, borderRadius: '50%', border: c === color && !isErasing ? '3px solid #FFF' : '3px solid transparent', padding: 0 }} aria-label={`Pilih warna ${c}`} />)}
          </div>
          <button onClick={handleEraserClick} className={`btn btn-sm ${isErasing ? 'btn-info' : 'btn-outline-info'}`} style={{width: 35, height: 35, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}} aria-label="Penghapus"><i className="fas fa-eraser"></i></button>
          <div className="vr d-none d-md-block"></div>
          <div className="d-flex gap-2 align-items-center" aria-label="Ukuran Kuas">
            {SIZES.map(s => <button key={s} onClick={() => setSize(s)} className={`btn btn-sm ${s === size ? 'btn-info' : 'btn-outline-info'}`} style={{width: 35, height: 35, borderRadius: '50%', padding: 0, fontSize: `${s*0.6}px` }} aria-label={`Pilih ukuran ${s}`}>●</button>)}
          </div>
           <div className="vr d-none d-md-block"></div>
          <div className="d-flex gap-2">
            <button onClick={handleUndo} className="btn btn-warning" aria-label="Urungkan"><i className="fas fa-undo"></i></button>
            <button onClick={handleClear} className="btn btn-danger" aria-label="Bersihkan Kanvas"><i className="fas fa-trash"></i></button>
          </div>
        </div>
      </>
    );

    const renderOnlineContent = () => {
        if (onlineStep !== 'game') {
            return (
              <div className="d-flex align-items-center justify-content-center w-100 h-100 p-3">
                 <OnlineGameSetup {...{ onlineStep, playerProfile, roomInputRef, handleProfileSubmit, handleEnterRoom, isLoading, error, handleChangeProfileRequest }} />
              </div>
            );
        }
        if (!onlineGameState) return <div className="text-center"><div className="spinner-border text-info"></div><p className="mt-3">Memuat game...</p></div>;
        if (!onlineGameState.players.O) return (
             <div className="d-flex align-items-center justify-content-center w-100 h-100 p-3">
                <GameLobby roomId={roomId} />
             </div>
        );
        
        const allPlayers = [onlineGameState.players.X, onlineGameState.players.O].filter(Boolean);

        return (
            <>
                <div 
                  className="d-flex flex-wrap justify-content-center align-items-center gap-4 p-2 rounded-pill"
                   style={{
                    position: 'absolute',
                    top: '4rem',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 20,
                    backgroundColor: 'rgba(40, 40, 40, 0.8)',
                    backdropFilter: 'blur(5px)',
                  }}
                >
                    {allPlayers.map(p => p && <PlayerDisplay key={p.deviceId} player={p} />)}
                </div>
                {renderDrawingInterface()}
            </>
        );
    };

    const renderContent = () => {
        if (gameMode === 'menu') {
            return (
                <div className="text-center d-flex flex-column align-items-center justify-content-center h-100">
                    <h2 className="display-5 fw-bold text-white mb-3">Gambar Bareng</h2>
                    <p className="fs-5 text-muted col-md-10 col-lg-8 mx-auto mb-5">{description}</p>
                    <div className="d-grid gap-3 col-sm-8 col-md-6 col-lg-4 mx-auto">
                        <button onClick={() => changeGameMode('local')} className="btn btn-primary btn-lg">Main Offline</button>
                        <button onClick={() => changeGameMode('online')} className="btn btn-info btn-lg">Main Online</button>
                    </div>
                </div>
            );
        }
        if (gameMode === 'local') {
            return renderDrawingInterface();
        }
        return renderOnlineContent();
    };

    // Render nothing if in menu mode, to allow the main App component to show the home screen
    if(gameMode === 'menu') {
        // We still need the back button logic for when we transition FROM a game mode back TO menu
        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 10, backgroundColor: '#212529' }}>
                <BackButton onClick={onBackToMenu} />
                {renderContent()}
            </div>
        );
    }

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10 }}>
             <BackButton onClick={() => changeGameMode('menu')} />
             {renderContent()}
        </div>
    );
};

export default DrawingGame;