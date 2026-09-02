import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Pen,
  Eraser,
  Trash2,
  Download,
  X,
  RotateCcw,
  Presentation,
} from 'lucide-react';
import { Button } from '../common/Button';
import { ParticipantTile } from './ParticipantTile';
import type { Participant, ConnectionQuality, DrawLinePayload, WhiteboardState } from '@boom/types';

interface WhiteboardStageProps {
  whiteboardState: WhiteboardState;
  localParticipant: Participant;
  localStream: MediaStream | null;
  remoteParticipants: Participant[];
  remoteStreams: Map<string, MediaStream>;
  connectionQuality: ConnectionQuality;
  onDraw: (line: DrawLinePayload) => void;
  onClear: () => void;
  onClose: () => void;
}

const COLORS = [
  '#ffffff', // White
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#10b981', // Emerald
  '#f59e0b', // Yellow
  '#a855f7', // Purple
  '#f97316', // Orange
  '#000000', // Black
];

const STROKE_SIZES = [
  { label: 'Fine', value: 2 },
  { label: 'Medium', value: 5 },
  { label: 'Thick', value: 10 },
];

export const WhiteboardStage: React.FC<WhiteboardStageProps> = ({
  whiteboardState,
  localParticipant,
  localStream,
  remoteParticipants,
  remoteStreams,
  connectionQuality,
  onDraw,
  onClear,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [activeTool, setActiveTool] = useState<'pen' | 'eraser'>('pen');
  const [selectedColor, setSelectedColor] = useState<string>('#ffffff');
  const [selectedSize, setSelectedSize] = useState<number>(5);

  // Undo history stack
  const historyRef = useRef<ImageData[]>([]);

  // Initialize and resize canvas
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Save current content before resize
    const ctx = canvas.getContext('2d');
    let prevData: ImageData | null = null;
    if (ctx && canvas.width > 0 && canvas.height > 0) {
      prevData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    if (ctx) {
      ctx.scale(dpr, dpr);
      // Dark chalkboard/whiteboard canvas background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, rect.width, rect.height);

      if (prevData) {
        ctx.putImageData(prevData, 0, 0);
      }
    }
  }, []);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Save current canvas state to undo history
  const pushHistory = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (historyRef.current.length > 20) {
      historyRef.current.shift();
    }
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || historyRef.current.length === 0) return;
    const last = historyRef.current.pop();
    if (last) {
      ctx.putImageData(last, 0, 0);
    }
  };

  // Draw a normalized segment onto the canvas
  const drawSegment = useCallback(
    (prevX: number, prevY: number, currX: number, currY: number, color: string, size: number, isEraser: boolean) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.save();
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size;

      if (isEraser) {
        ctx.strokeStyle = '#0f172a'; // Match background
      } else {
        ctx.strokeStyle = color;
      }

      ctx.moveTo(prevX * width, prevY * height);
      ctx.lineTo(currX * width, currY * height);
      ctx.stroke();
      ctx.closePath();
      ctx.restore();
    },
    []
  );

  // Expose remote draw receiver
  useEffect(() => {
    (window as any).__boom_drawSegment = drawSegment;
    (window as any).__boom_clearCanvas = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    };
  }, [drawSegment]);

  // Pointer event handlers for drawing (Mouse, Pen, Touch)
  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pushHistory();
    isDrawingRef.current = true;
    const point = getCoordinates(e);
    lastPointRef.current = point;
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPointRef.current) return;
    const currPoint = getCoordinates(e);
    const prevPoint = lastPointRef.current;

    const isEraser = activeTool === 'eraser';
    drawSegment(prevPoint.x, prevPoint.y, currPoint.x, currPoint.y, selectedColor, selectedSize, isEraser);

    // Broadcast draw event to peers
    onDraw({
      prevX: prevPoint.x,
      prevY: prevPoint.y,
      currX: currPoint.x,
      currY: currPoint.y,
      color: selectedColor,
      size: selectedSize,
      isEraser,
    });

    lastPointRef.current = currPoint;
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleClear = () => {
    pushHistory();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    onClear();
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `boom-whiteboard-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="w-full h-full flex flex-col p-2 sm:p-4 gap-3 overflow-hidden">
      {/* Top Banner & Whiteboard Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-dark-card border border-dark-border rounded-2xl text-xs sm:text-sm font-medium text-slate-200">
        <div className="flex items-center gap-2">
          <Presentation className="w-4 h-4 text-brand-400" />
          <span>
            {whiteboardState.activePresenterName
              ? `${whiteboardState.activePresenterName}'s Whiteboard`
              : 'Collaborative Whiteboard'}
          </span>
        </div>

        {/* Tools Palette */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Pen / Eraser Toggle */}
          <div className="flex items-center bg-dark-surface rounded-xl p-0.5 border border-dark-border">
            <button
              onClick={() => setActiveTool('pen')}
              title="Pen tool"
              className={`p-1.5 rounded-lg transition-colors ${
                activeTool === 'pen' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Pen className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveTool('eraser')}
              title="Eraser tool"
              className={`p-1.5 rounded-lg transition-colors ${
                activeTool === 'eraser' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eraser className="w-4 h-4" />
            </button>
          </div>

          {/* Color Palette (Pen mode) */}
          {activeTool === 'pen' && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-dark-surface rounded-xl border border-dark-border">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setSelectedColor(c)}
                  className={`w-4 h-4 rounded-full transition-transform ${
                    selectedColor === c ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          )}

          {/* Stroke Size */}
          <div className="flex items-center gap-1 bg-dark-surface rounded-xl p-0.5 border border-dark-border text-xs">
            {STROKE_SIZES.map((s) => (
              <button
                key={s.value}
                onClick={() => setSelectedSize(s.value)}
                className={`px-2 py-1 rounded-lg transition-colors ${
                  selectedSize === s.value ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Undo */}
          <button
            onClick={handleUndo}
            title="Undo"
            className="p-2 rounded-xl bg-dark-surface hover:bg-dark-hover border border-dark-border text-slate-300 hover:text-white transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Clear Board */}
          <button
            onClick={handleClear}
            title="Clear canvas"
            className="p-2 rounded-xl bg-dark-surface hover:bg-rose-500/20 border border-dark-border text-slate-300 hover:text-rose-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Save PNG */}
          <button
            onClick={handleDownload}
            title="Download whiteboard image"
            className="p-2 rounded-xl bg-dark-surface hover:bg-brand-500/20 border border-dark-border text-slate-300 hover:text-brand-400 transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Close Whiteboard */}
          <Button
            variant="danger"
            size="sm"
            onClick={onClose}
            leftIcon={<X className="w-4 h-4" />}
            className="py-1.5 px-3 text-xs"
          >
            Close
          </Button>
        </div>
      </div>

      {/* Canvas Main Stage + Docked Video Strip */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 overflow-hidden">
        {/* Interactive Whiteboard Canvas */}
        <div
          ref={containerRef}
          className="flex-1 bg-slate-900 rounded-2xl border border-dark-border overflow-hidden relative shadow-2xl flex items-center justify-center cursor-crosshair touch-none"
        >
          <canvas
            ref={canvasRef}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            className="w-full h-full block"
          />
        </div>

        {/* Video Strip (Right on desktop, Bottom on mobile) */}
        <div className="lg:w-64 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto min-h-[120px] lg:min-h-0">
          {/* Local participant tile */}
          <div className="w-44 lg:w-full aspect-video shrink-0">
            <ParticipantTile
              participant={localParticipant}
              stream={localStream}
              isLocal={true}
              connectionQuality={connectionQuality}
            />
          </div>

          {/* Remote participants tiles */}
          {remoteParticipants.map((p) => {
            const stream = remoteStreams.get(p.id) || null;
            return (
              <div key={p.id} className="w-44 lg:w-full aspect-video shrink-0">
                <ParticipantTile
                  participant={p}
                  stream={stream}
                  isLocal={false}
                  connectionQuality={connectionQuality}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
