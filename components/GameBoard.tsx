import React, { useRef, useEffect, useCallback } from 'react';
import type { Player } from '../types';

interface GameBoardProps {
    size: number;
    boardState?: (Player | null)[];
    winningLine?: number[];
    onCellClick?: (index: number) => void;
    disabled?: boolean;
    renderChessPattern?: boolean;
}

// Helper to draw a thick, 3D-esque 'X'
const draw3DX = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string
) => {
    const armLength = size * 0.35;
    const thickness = size * 0.12;
    const shadowOffset = size * 0.03;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);

    // Shadow
    const shadowPath = new Path2D();
    shadowPath.rect(-armLength, -thickness / 2, armLength * 2, thickness);
    shadowPath.rect(-thickness / 2, -armLength, thickness, armLength * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.translate(shadowOffset, shadowOffset);
    ctx.fill(shadowPath);
    ctx.translate(-shadowOffset, -shadowOffset);

    // Main shape
    const gradient = ctx.createLinearGradient(-armLength, -thickness, armLength, thickness);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, '#0b93a8'); // Darker cyan
    ctx.fillStyle = gradient;
    ctx.fill(shadowPath);

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.rect(-armLength, -thickness / 2, armLength * 2, thickness / 3.5);
    ctx.rect(-thickness / 2, -armLength, thickness / 3.5, armLength * 2);
    ctx.fill();

    ctx.restore();
};

// Helper to draw a thick, 3D-esque 'O'
const draw3DO = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string
) => {
    const radius = size * 0.3;
    const thickness = size * 0.12;
    const shadowOffset = size * 0.03;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(x + shadowOffset, y + shadowOffset, radius, 0, 2 * Math.PI);
    ctx.fill();

    // Main ring
    const gradient = ctx.createRadialGradient(x - radius/2, y - radius/2, 0, x, y, radius + thickness);
    gradient.addColorStop(0, '#ffe485'); // Lighter yellow
    gradient.addColorStop(1, color);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.stroke();
    
    // Inner shadow for depth
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius - thickness / 2, 0, 2 * Math.PI);
    ctx.stroke();
};


const GameBoard: React.FC<GameBoardProps> = ({
    size,
    boardState = [],
    winningLine = [],
    onCellClick = () => {},
    disabled = false,
    renderChessPattern = false
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
        }
        const viewSize = canvas.width / dpr;
        
        ctx.clearRect(0, 0, viewSize, viewSize);

        // --- Draw 3D Inset Board ---
        const boardDepth = viewSize * 0.01;
        ctx.fillStyle = '#1a1d20'; // Bevel color
        ctx.fillRect(0, 0, viewSize, viewSize);
        
        ctx.save();
        ctx.translate(boardDepth, boardDepth);
        const boardSize = viewSize - boardDepth * 2;
        ctx.fillStyle = '#212529'; // Top surface color
        ctx.fillRect(0, 0, boardSize, boardSize);
        
        const cellSize = boardSize / size;

        // --- Draw Engraved Grid Lines or Chess Pattern ---
        for (let i = 0; i < size * size; i++) {
            const row = Math.floor(i / size);
            const col = i % size;
            const x = col * cellSize;
            const y = row * cellSize;
            if (renderChessPattern) {
                ctx.fillStyle = (row + col) % 2 === 0 ? '#6c757d' : '#343a40';
                ctx.fillRect(x, y, cellSize, cellSize);
            }
        }
        
        if (!renderChessPattern) {
            ctx.lineCap = 'round';
            for (let i = 1; i < size; i++) {
                const pos = i * cellSize;
                // Shadow line
                ctx.strokeStyle = '#1a1d20';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(pos, 0);
                ctx.lineTo(pos, boardSize);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, pos);
                ctx.lineTo(boardSize, pos);
                ctx.stroke();
                // Highlight line
                ctx.strokeStyle = '#495057';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(pos - 2, 0);
                ctx.lineTo(pos - 2, boardSize);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, pos - 2);
                ctx.lineTo(boardSize, pos - 2);
                ctx.stroke();
            }
        }
        
        // --- Draw Pieces ---
        boardState.forEach((piece, index) => {
            if (!piece) return;
            const row = Math.floor(index / size);
            const col = index % size;
            const centerX = col * cellSize + cellSize / 2;
            const centerY = row * cellSize + cellSize / 2;
            
            if (piece === 'X') {
                draw3DX(ctx, centerX, centerY, cellSize, '#0dcaf0');
            } else if (piece === 'O') {
                draw3DO(ctx, centerX, centerY, cellSize, '#ffc107');
            }
        });
        
        // --- Draw Winning Line ---
        if (winningLine.length > 0) {
            ctx.strokeStyle = "rgba(25, 135, 84, 0.85)";
            ctx.lineWidth = 12;
            ctx.lineCap = 'round';
            
            const firstCell = winningLine[0];
            const lastCell = winningLine[winningLine.length - 1];
            
            const startX = (firstCell % size) * cellSize + cellSize / 2;
            const startY = Math.floor(firstCell / size) * cellSize + cellSize / 2;
            const endX = (lastCell % size) * cellSize + cellSize / 2;
            const endY = Math.floor(lastCell / size) * cellSize + cellSize / 2;
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
        
        ctx.restore();

    }, [boardState, winningLine, size, renderChessPattern]);
    
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const observer = new ResizeObserver(() => draw());
        observer.observe(container);
        return () => observer.disconnect();
    }, [draw]);

    useEffect(() => {
        draw();
    }, [draw, boardState]);

    const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (disabled || !onCellClick) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const boardDepth = (canvas.width / dpr) * 0.01;
        
        const x = event.clientX - rect.left - boardDepth;
        const y = event.clientY - rect.top - boardDepth;
        
        const boardSize = rect.width - boardDepth * 2;
        const cellSize = boardSize / size;
        
        if (x < 0 || y < 0 || x > boardSize || y > boardSize) return;

        const col = Math.floor(x / cellSize);
        const row = Math.floor(y / cellSize);
        
        onCellClick(row * size + col);
    };

    return (
        <div ref={containerRef} className="p-3 rounded-3 shadow-lg" style={{ backgroundColor: '#1a1d20', maxWidth: '450px', width: '90vw', aspectRatio: '1 / 1' }}>
            <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                style={{ width: '100%', height: '100%', cursor: disabled ? 'default' : 'pointer' }}
            />
        </div>
    );
};

export default GameBoard;