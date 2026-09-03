import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Pen,
  Eraser,
  Crop,
  Trash2,
  Download,
  X,
  RotateCcw,
  Presentation,
  PanelRightClose,
  PanelRightOpen,
  ShieldCheck,
  Clock3,
} from 'lucide-react';
import { Button } from '../common/Button';
import { ParticipantTile } from './ParticipantTile';
import type { Participant, ConnectionQuality, DrawLinePayload, WhiteboardState, EraseRectPayload } from '@boom/types';

interface WhiteboardStageProps {
  whiteboardState: WhiteboardState;
  localParticipant: Participant;
  localStream: MediaStream | null;
  remoteParticipants: Participant[];
  remoteStreams: Map<string, MediaStream>;
  connectionQuality: ConnectionQuality;
  isHost: boolean;
  canEdit: boolean;
  whiteboardPermission: 'idle' | 'pending' | 'granted' | 'denied';
  onRequestEdit: () => void;
  onDraw: (line: DrawLinePayload) => void;
  onStrokeEnd: () => void;
  onUndo: () => void;
  onClear: () => void;
  onScroll: (scrollTop: number) => void;
  onEraseRect: (rect: EraseRectPayload) => void;
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

const BOARD_BG = '#0f172a';
// Tall logical canvas height so the board can hold many notes/drawings and
// scroll like a document, instead of being limited to a single screen.
const BOARD_HEIGHT = 4000;

export const WhiteboardStage: React.FC<WhiteboardStageProps> = ({
  whiteboardState,
  localParticipant,
  localStream,
  remoteParticipants,
  remoteStreams,
  connectionQuality,
  isHost,
  canEdit,
  whiteboardPermission,
  onRequestEdit,
  onDraw,
  onStrokeEnd,
  onUndo,
  onClear,
  onScroll,
  onEraseRect,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [activeTool, setActiveTool] = useState<'pen' | 'eraser' | 'rect-erase'>('pen');
  const [selectedColor, setSelectedColor] = useState<string>('#ffffff');
  const [selectedSize, setSelectedSize] = useState<number>(5);
  const [showVideoStrip, setShowVideoStrip] = useState(true);
  // Live rectangle currently being dragged out by the rect-erase tool (screen px, for the overlay only)
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);

  // Synced stroke history: a "stroke" is everything drawn between a
  // pointer-down and pointer-up. Keeping the full history (rather than just
  // pixel snapshots) lets every participant redraw the same board state,
  // so undo can be broadcast and applied identically on every screen.
  const allStrokesRef = useRef<DrawLinePayload[][]>([]);
  const currentLocalStrokeRef = useRef<DrawLinePayload[]>([]);
  const remoteBuffersRef = useRef<Map<string, DrawLinePayload[]>>(new Map());

  // Paint a single normalized segment onto the canvas (pure drawing, no history)
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
      ctx.strokeStyle = isEraser ? BOARD_BG : color;
      ctx.moveTo(prevX * width, prevY * height);
      ctx.lineTo(currX * width, currY * height);
      ctx.stroke();
      ctx.closePath();
      ctx.restore();
    },
    []
  );

  const paintBackground = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  }, []);

  // Redraw the entire board from the synced stroke history (used after
  // undo, clear, resize — anything where the canvas needs to be rebuilt).
  const redrawAll = useCallback(() => {
    paintBackground();
    for (const stroke of allStrokesRef.current) {
      for (const seg of stroke) {
        drawSegment(seg.prevX, seg.prevY, seg.currX, seg.currY, seg.color, seg.size, seg.isEraser);
      }
    }
  }, [drawSegment, paintBackground]);

  // Initialize / resize canvas. Width tracks the container; height is a
  // fixed tall value so the board scrolls vertically like a document.
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = BOARD_HEIGHT * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${BOARD_HEIGHT}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
    redrawAll();
  }, [redrawAll]);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remove every segment whose midpoint falls inside the given rectangle
  // (normalized 0..1 coords, same space as DrawLinePayload). Used by the
  // rectangle-select eraser, both locally and when a remote peer erases.
  const applyEraseRect = useCallback(
    (rect: EraseRectPayload) => {
      const x1 = Math.min(rect.x1, rect.x2);
      const x2 = Math.max(rect.x1, rect.x2);
      const y1 = Math.min(rect.y1, rect.y2);
      const y2 = Math.max(rect.y1, rect.y2);

      const inRect = (x: number, y: number) => x >= x1 && x <= x2 && y >= y1 && y <= y2;

      allStrokesRef.current = allStrokesRef.current
        .map((stroke) =>
          stroke.filter((seg) => {
            const midX = (seg.prevX + seg.currX) / 2;
            const midY = (seg.prevY + seg.currY) / 2;
            return !inRect(midX, midY);
          })
        )
        .filter((stroke) => stroke.length > 0);

      redrawAll();
    },
    [redrawAll]
  );

  const handleUndo = useCallback(() => {
    if (!canEdit || allStrokesRef.current.length === 0) return;
    allStrokesRef.current.pop();
    redrawAll();
    onUndo();
  }, [canEdit, redrawAll, onUndo]);

  // Bridge functions so MeetingRoomPage (which owns the socket connection)
  // can feed remote events into this component without prop-drilling through
  // the parent on every keystroke of the socket hook.
  useEffect(() => {
    (window as any).__boom_drawSegment = (
      prevX: number,
      prevY: number,
      currX: number,
      currY: number,
      color: string,
      size: number,
      isEraser: boolean,
      senderId?: string
    ) => {
      drawSegment(prevX, prevY, currX, currY, color, size, isEraser);
      if (senderId) {
        const buf = remoteBuffersRef.current.get(senderId) || [];
        buf.push({ prevX, prevY, currX, currY, color, size, isEraser });
        remoteBuffersRef.current.set(senderId, buf);
      }
    };

    (window as any).__boom_strokeEnd = (senderId: string) => {
      const buf = remoteBuffersRef.current.get(senderId);
      if (buf && buf.length > 0) {
        allStrokesRef.current.push(buf);
      }
      remoteBuffersRef.current.set(senderId, []);
    };

    (window as any).__boom_undo = () => {
      if (allStrokesRef.current.length === 0) return;
      allStrokesRef.current.pop();
      redrawAll();
    };

    (window as any).__boom_clearCanvas = () => {
      allStrokesRef.current = [];
      remoteBuffersRef.current.clear();
      currentLocalStrokeRef.current = [];
      paintBackground();
    };

    (window as any).__boom_scrollTo = (scrollTop: number) => {
      if (containerRef.current) {
        containerRef.current.scrollTop = scrollTop;
      }
    };

    (window as any).__boom_eraseRect = (rect: EraseRectPayload) => {
      applyEraseRect(rect);
    };

    return () => {
      delete (window as any).__boom_drawSegment;
      delete (window as any).__boom_strokeEnd;
      delete (window as any).__boom_undo;
      delete (window as any).__boom_clearCanvas;
      delete (window as any).__boom_scrollTo;
      delete (window as any).__boom_eraseRect;
    };
  }, [drawSegment, redrawAll, paintBackground, applyEraseRect]);

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
    if (!canEdit) return;
    const point = getCoordinates(e);

    if (activeTool === 'rect-erase') {
      selectionStartRef.current = point;
      const container = containerRef.current;
      const widthPx = container?.clientWidth || 0;
      setSelectionRect({ x: point.x * widthPx, y: point.y * BOARD_HEIGHT, w: 0, h: 0 });
      return;
    }

    isDrawingRef.current = true;
    currentLocalStrokeRef.current = [];
    lastPointRef.current = point;
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit) return;
    if (activeTool === 'rect-erase') {
      if (!selectionStartRef.current) return;
      const container = containerRef.current;
      const widthPx = container?.clientWidth || 0;
      const start = selectionStartRef.current;
      const curr = getCoordinates(e);

      const x1px = start.x * widthPx;
      const y1px = start.y * BOARD_HEIGHT;
      const x2px = curr.x * widthPx;
      const y2px = curr.y * BOARD_HEIGHT;

      setSelectionRect({
        x: Math.min(x1px, x2px),
        y: Math.min(y1px, y2px),
        w: Math.abs(x2px - x1px),
        h: Math.abs(y2px - y1px),
      });
      return;
    }

    if (!isDrawingRef.current || !lastPointRef.current) return;
    const currPoint = getCoordinates(e);
    const prevPoint = lastPointRef.current;

    const isEraser = activeTool === 'eraser';
    const segment: DrawLinePayload = {
      prevX: prevPoint.x,
      prevY: prevPoint.y,
      currX: currPoint.x,
      currY: currPoint.y,
      color: selectedColor,
      size: selectedSize,
      isEraser,
    };

    drawSegment(segment.prevX, segment.prevY, segment.currX, segment.currY, segment.color, segment.size, segment.isEraser);
    currentLocalStrokeRef.current.push(segment);

    // Broadcast draw event to peers (live, segment-by-segment for smoothness)
    onDraw(segment);

    lastPointRef.current = currPoint;
  };

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit) return;
    if (activeTool === 'rect-erase') {
      if (selectionStartRef.current) {
        const start = selectionStartRef.current;
        const end = getCoordinates(e);
        const rect: EraseRectPayload = { x1: start.x, y1: start.y, x2: end.x, y2: end.y };

        // Only erase if the user actually dragged a real box, not a stray click
        if (Math.abs(rect.x2 - rect.x1) > 0.002 || Math.abs(rect.y2 - rect.y1) > 0.002) {
          applyEraseRect(rect);
          onEraseRect(rect);
        }
      }
      selectionStartRef.current = null;
      setSelectionRect(null);
      return;
    }

    if (isDrawingRef.current && currentLocalStrokeRef.current.length > 0) {
      allStrokesRef.current.push(currentLocalStrokeRef.current);
      currentLocalStrokeRef.current = [];
      onStrokeEnd();
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  // Broadcast our scroll position when we're the host, so viewers stay on
  // par with whatever part of the board we're currently writing on.
  const scrollRafRef = useRef<number | null>(null);
  const handleContainerScroll = () => {
    if (!isHost) return;
    const container = containerRef.current;
    if (!container) return;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      onScroll(container.scrollTop);
    });
  };

  const handleClear = () => {
    if (!canEdit) return;
    allStrokesRef.current = [];
    remoteBuffersRef.current.clear();
    currentLocalStrokeRef.current = [];
    paintBackground();
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
          {!canEdit ? (
            <div className="flex items-center gap-2">
              {whiteboardPermission === 'pending' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
                  <Clock3 className="w-3.5 h-3.5" /> Waiting for host approval
                </span>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onRequestEdit}
                  leftIcon={<Pen className="w-4 h-4" />}
                  className="py-1.5 px-3 text-xs"
                >
                  {whiteboardPermission === 'denied' ? 'Request Again' : 'Request Editing Access'}
                </Button>
              )}
            </div>
          ) : (
            <>
          {/* Pen / Eraser / Rect-erase Toggle */}
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
            <button
              onClick={() => setActiveTool('rect-erase')}
              title="Drag to select and erase an area"
              className={`p-1.5 rounded-lg transition-colors ${
                activeTool === 'rect-erase' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Crop className="w-4 h-4" />
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

          {/* Only the host can close the whiteboard */}
          {isHost && (
            <Button
              variant="danger"
              size="sm"
              onClick={onClose}
              leftIcon={<X className="w-4 h-4" />}
              className="py-1.5 px-3 text-xs"
            >
              Close
            </Button>
          )}
            </>
          )}

          {canEdit && !isHost && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" /> Editing allowed by host
            </span>
          )}

          {isHost && (
            <button
              onClick={() => setShowVideoStrip((prev) => !prev)}
              title={showVideoStrip ? 'Minimize participant videos' : 'Show participant videos'}
              aria-label={showVideoStrip ? 'Minimize participant videos' : 'Show participant videos'}
              className="p-2 rounded-xl bg-dark-surface hover:bg-dark-hover border border-dark-border text-slate-300 hover:text-white transition-colors"
            >
              {showVideoStrip ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Canvas Main Stage + Docked Video Strip */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 overflow-hidden">
        {/* Interactive Whiteboard Canvas — scrolls vertically like a document */}
        <div
          ref={containerRef}
          onScroll={handleContainerScroll}
          className={`flex-1 bg-slate-900 rounded-2xl border border-dark-border overflow-y-auto overflow-x-hidden relative shadow-2xl touch-none ${canEdit ? 'cursor-crosshair' : 'cursor-default'}`}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            className={`block ${canEdit ? '' : 'pointer-events-none'}`}
          />

          {/* Rectangle-select eraser overlay (drag to mark an area for deletion) */}
          {selectionRect && (
            <div
              className="absolute border-2 border-dashed border-rose-400 bg-rose-400/10 pointer-events-none"
              style={{
                left: selectionRect.x,
                top: selectionRect.y,
                width: selectionRect.w,
                height: selectionRect.h,
              }}
            />
          )}
        </div>

        {/* Video Strip (Right on desktop, Bottom on mobile) */}
        {showVideoStrip && (
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
        )}
      </div>
    </div>
  );
};