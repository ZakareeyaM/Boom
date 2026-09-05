import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Pen,
  Eraser,
  Crop,
  Trash2,
  Download,
  X,
  RotateCcw,
  Redo2,
  Square,
  Circle,
  Minus,
  ArrowUpRight,
  Triangle,
  Diamond,
  Grid3X3,
  Hexagon,
  Star,
  Heart,
  Octagon,
  Cloud,
  Presentation,
  PanelRightClose,
  PanelRightOpen,
  ShieldCheck,
  Clock3,
  Type,
  Upload,
  MousePointer2,
} from 'lucide-react';
import { Button } from '../common/Button';
import { ParticipantTile } from './ParticipantTile';
import { useTheme } from '../../context/ThemeContext';
import { WhiteboardObjectsLayer } from './WhiteboardObjectsLayer';
import { ThemeToggle } from '../layout/ThemeToggle';
import type { Participant, ConnectionQuality, DrawLinePayload, WhiteboardState, EraseRectPayload, WhiteboardAsset, WhiteboardCursor, WhiteboardText, WhiteboardShape } from '@boom/types';

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
  onRedo: () => void;
  onClear: () => void;
  onScroll: (scrollTop: number) => void;
  onEraseRect: (rect: EraseRectPayload) => void;
  whiteboardHistory?: DrawLinePayload[][];
  whiteboardAsset?: WhiteboardAsset | null;
  whiteboardTexts?: WhiteboardText[];
  whiteboardShapes?: WhiteboardShape[];
  onShape?: (shape: WhiteboardShape) => void;
  onShapeUpdate?: (shape: WhiteboardShape) => void;
  onShapeDelete?: (shapeId: string) => void;
  onTextUpdate?: (text: WhiteboardText) => void;
  onTextDelete?: (textId: string) => void;
  remoteCursors?: Map<string, WhiteboardCursor>;
  onCursor?: (cursor: Omit<WhiteboardCursor,'participantId'|'displayName'>) => void;
  onAsset?: (asset: WhiteboardAsset | null) => void;
  onText?: (text: WhiteboardText) => void;
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
  onRedo,
  onClear,
  onScroll,
  onEraseRect,
  whiteboardHistory = [],
  whiteboardAsset = null,
  whiteboardTexts = [],
  remoteCursors = new Map(),
  onCursor,
  onAsset,
  onText,
  onTextUpdate,
  onTextDelete,
  whiteboardShapes = [],
  onShape,
  onShapeUpdate,
  onShapeDelete,
  onClose,
}) => {
  const { isDark } = useTheme();
  const boardBackground = isDark ? '#0f172a' : '#ffffff';

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [activeTool, setActiveTool] = useState<'pen' | 'eraser' | 'rect-erase' | 'shape' | 'text'>('pen');
  const [textDraft, setTextDraft] = useState('');
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [textInsertPos, setTextInsertPos] = useState<{x:number;y:number}|null>(null);
  const [editingTextId, setEditingTextId] = useState<string|null>(null);
  const erasedTextIdsRef = useRef<Set<string>>(new Set());
  // Focus the editor only after React has mounted it. Using a ref is more reliable
  // than querying the DOM/requestAnimationFrame, especially when the board is scrolling.
  useEffect(() => {
    if (!textInsertPos || !canEdit) return;
    const editor = textEditorRef.current;
    if (!editor) return;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }, [textInsertPos, canEdit]);

  const [selectedObjectId, setSelectedObjectId] = useState<string|null>(null);
  const [graphXMin, setGraphXMin] = useState(-5);
  const [graphXMax, setGraphXMax] = useState(5);
  const [graphYMin, setGraphYMin] = useState(-5);
  const [graphYMax, setGraphYMax] = useState(5);
  const [graphXInterval, setGraphXInterval] = useState(1);
  const [graphYInterval, setGraphYInterval] = useState(1);
  const [selectedShape, setSelectedShape] = useState<'rectangle' | 'rounded-rectangle' | 'ellipse' | 'line' | 'arrow' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'octagon' | 'star' | 'heart' | 'cloud' | 'grid' | 'graph'>('rectangle');
  const [gridRows, setGridRows] = useState(4);
  const [gridCols, setGridCols] = useState(4);
  const [selectedColor, setSelectedColor] = useState<string>('#ffffff');
  const [selectedSize, setSelectedSize] = useState<number>(5);
  const [eraserSize, setEraserSize] = useState<number>(24);
  const [pointerPos, setPointerPos] = useState<{x:number;y:number}|null>(null);
  const [showVideoStrip, setShowVideoStrip] = useState(true);
  const [assetZoom, setAssetZoom] = useState(100);
  // Live rectangle currently being dragged out by the rect-erase tool (screen px, for the overlay only)
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);

  // Synced stroke history: a "stroke" is everything drawn between a
  // pointer-down and pointer-up. Keeping the full history (rather than just
  // pixel snapshots) lets every participant redraw the same board state,
  // so undo can be broadcast and applied identically on every screen.
  const allStrokesRef = useRef<DrawLinePayload[][]>([]);
  const currentLocalStrokeRef = useRef<DrawLinePayload[]>([]);
  const redoStrokesRef = useRef<DrawLinePayload[][]>([]);
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
      if (isEraser && whiteboardAsset) { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = 'rgba(0,0,0,1)'; } else { ctx.strokeStyle = isEraser ? boardBackground : color; }
      const startX = prevX * width;
      const startY = prevY * height;
      const endX = currX * width;
      const endY = currY * height;
      if (Math.abs(startX - endX) < 0.01 && Math.abs(startY - endY) < 0.01) {
        ctx.fillStyle = isEraser ? boardBackground : color;
        ctx.arc(startX, startY, Math.max(1, size / 2), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
      ctx.closePath();
      ctx.restore();
    },
    [boardBackground, whiteboardAsset]
  );

  const paintBackground = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    if (!whiteboardAsset) { ctx.fillStyle = boardBackground; ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr); }
  }, [boardBackground, whiteboardAsset]);

  // Redraw the entire board from the synced stroke history (used after
  // undo, clear, resize — anything where the canvas needs to be rebuilt).
  const redrawAll = useCallback(() => {
    // Text objects are rendered by WhiteboardObjectsLayer (SVG). Do not also
    // paint them onto the canvas, otherwise every text object appears twice.
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
    const observer = typeof ResizeObserver !== 'undefined' && containerRef.current ? new ResizeObserver(() => handleResize()) : null;
    if (observer && containerRef.current) observer.observe(containerRef.current);
    return () => { window.removeEventListener('resize', handleResize); observer?.disconnect(); };
  }, [handleResize, showVideoStrip]);

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
    const stroke = allStrokesRef.current.pop();
    if (stroke) redoStrokesRef.current.push(stroke);
    redrawAll();
    onUndo();
  }, [canEdit, redrawAll, onUndo]);

  const handleRedo = useCallback(() => {
    if (!canEdit || redoStrokesRef.current.length === 0) return;
    const stroke = redoStrokesRef.current.pop();
    if (!stroke) return;
    allStrokesRef.current.push(stroke);
    redrawAll();
    onRedo();
  }, [canEdit, redrawAll, onRedo]);

  // Bridge functions so MeetingRoomPage (which owns the socket connection)
  // can feed remote events into this component without prop-drilling through
  // the parent on every keystroke of the socket hook.
  useEffect(() => {
    allStrokesRef.current = whiteboardHistory.map(stroke => [...stroke]);
    redoStrokesRef.current = [];
    redrawAll();
  }, [whiteboardHistory, whiteboardAsset, whiteboardTexts, redrawAll]);

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
      redoStrokesRef.current = [];
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
      const stroke = allStrokesRef.current.pop();
      if (stroke) redoStrokesRef.current.push(stroke);
      redrawAll();
    };

    (window as any).__boom_redo = () => {
      if (redoStrokesRef.current.length === 0) return;
      const stroke = redoStrokesRef.current.pop();
      if (!stroke) return;
      allStrokesRef.current.push(stroke);
      redrawAll();
    };

    (window as any).__boom_clearCanvas = () => {
      allStrokesRef.current = [];
      redoStrokesRef.current = [];
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
      delete (window as any).__boom_redo;
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

  const makeSegment = (x1: number, y1: number, x2: number, y2: number): DrawLinePayload => ({
    prevX: x1,
    prevY: y1,
    currX: x2,
    currY: y2,
    color: selectedColor,
    size: selectedSize,
    isEraser: false,
  });

  const getShapeSegments = useCallback(
    (x1: number, y1: number, x2: number, y2: number): DrawLinePayload[] => {
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      const width = right - left;
      const height = bottom - top;
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      const segments: DrawLinePayload[] = [];

      if (selectedShape === 'rectangle') {
        segments.push(
          makeSegment(left, top, right, top),
          makeSegment(right, top, right, bottom),
          makeSegment(right, bottom, left, bottom),
          makeSegment(left, bottom, left, top),
        );
      } else if (selectedShape === 'ellipse') {
        const steps = 64;
        const rx = width / 2;
        const ry = height / 2;
        for (let i = 0; i < steps; i++) {
          const a1 = (i / steps) * Math.PI * 2;
          const a2 = ((i + 1) / steps) * Math.PI * 2;
          segments.push(makeSegment(cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry, cx + Math.cos(a2) * rx, cy + Math.sin(a2) * ry));
        }
      } else if (selectedShape === 'line') {
        segments.push(makeSegment(x1, y1, x2, y2));
      } else if (selectedShape === 'arrow') {
        segments.push(makeSegment(x1, y1, x2, y2));
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = Math.max(0.015, Math.min(0.05, Math.hypot(width, height) * 0.08));
        segments.push(
          makeSegment(x2, y2, x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6)),
          makeSegment(x2, y2, x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6)),
        );
      } else if (selectedShape === 'triangle') {
        const apexX = cx;
        segments.push(
          makeSegment(apexX, top, right, bottom),
          makeSegment(right, bottom, left, bottom),
          makeSegment(left, bottom, apexX, top),
        );
      } else if (selectedShape === 'diamond') {
        segments.push(
          makeSegment(cx, top, right, cy),
          makeSegment(right, cy, cx, bottom),
          makeSegment(cx, bottom, left, cy),
          makeSegment(left, cy, cx, top),
        );
      } else if (selectedShape === 'rounded-rectangle') {
        // Approximate a rounded rectangle with four straight sides and
        // quarter-circle corner arcs.
        const radius = Math.min(width, height) * 0.18;
        const r = Math.min(radius, width / 2, height / 2);
        const arcSteps = 12;
        const corners = [
          { cx: right - r, cy: top + r, start: -Math.PI / 2, end: 0 },
          { cx: right - r, cy: bottom - r, start: 0, end: Math.PI / 2 },
          { cx: left + r, cy: bottom - r, start: Math.PI / 2, end: Math.PI },
          { cx: left + r, cy: top + r, start: Math.PI, end: Math.PI * 1.5 },
        ];
        segments.push(makeSegment(left + r, top, right - r, top));
        for (const corner of corners) {
          for (let i = 0; i < arcSteps; i++) {
            const a1 = corner.start + ((corner.end - corner.start) * i) / arcSteps;
            const a2 = corner.start + ((corner.end - corner.start) * (i + 1)) / arcSteps;
            segments.push(makeSegment(
              corner.cx + Math.cos(a1) * r,
              corner.cy + Math.sin(a1) * r,
              corner.cx + Math.cos(a2) * r,
              corner.cy + Math.sin(a2) * r,
            ));
          }
        }
        segments.push(makeSegment(left + r, bottom, right - r, bottom));
      } else if (selectedShape === 'pentagon' || selectedShape === 'hexagon' || selectedShape === 'octagon') {
        const sides = selectedShape === 'pentagon' ? 5 : selectedShape === 'hexagon' ? 6 : 8;
        const points: Array<{ x: number; y: number }> = [];
        const rx = width / 2; const ry = height / 2;
        for (let i = 0; i < sides; i++) {
          const angle = -Math.PI / 2 + (i * Math.PI * 2) / sides;
          points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
        }
        for (let i = 0; i < points.length; i++) {
          const a = points[i];
          const b = points[(i + 1) % points.length];
          segments.push(makeSegment(a.x, a.y, b.x, b.y));
        }
      } else if (selectedShape === 'star') {
        const points: Array<{ x: number; y: number }> = [];
        const outerX = width / 2; const outerY = height / 2;
        const innerX = outerX * 0.45; const innerY = outerY * 0.45;
        for (let i = 0; i < 10; i++) {
          const angle = -Math.PI / 2 + (i * Math.PI) / 5;
          const rx = i % 2 === 0 ? outerX : innerX; const ry = i % 2 === 0 ? outerY : innerY;
          points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
        }
        for (let i = 0; i < points.length; i++) {
          const a = points[i];
          const b = points[(i + 1) % points.length];
          segments.push(makeSegment(a.x, a.y, b.x, b.y));
        }
      } else if (selectedShape === 'heart') {
        const steps = 80;
        let prev: { x: number; y: number } | null = null;
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          const px = cx + (width * 0.46) * Math.pow(Math.sin(t), 3);
          const py = cy - (height * 0.38) * (0.8 * Math.cos(t) - 0.35 * Math.cos(2 * t) - 0.18 * Math.cos(3 * t) - 0.08 * Math.cos(4 * t));
          if (prev) segments.push(makeSegment(prev.x, prev.y, px, py));
          prev = { x: px, y: py };
        }
      } else if (selectedShape === 'cloud') {
        // A simple cloud made from connected arc-like points.
        const pts: Array<{ x: number; y: number }> = [];
        const addArc = (acx: number, acy: number, rx: number, ry: number, start: number, end: number, steps: number) => {
          for (let i = 0; i <= steps; i++) {
            const a = start + ((end - start) * i) / steps;
            pts.push({ x: acx + Math.cos(a) * rx, y: acy + Math.sin(a) * ry });
          }
        };
        addArc(left + width * 0.22, cy, width * 0.18, height * 0.25, Math.PI * 0.55, Math.PI * 1.55, 10);
        addArc(left + width * 0.42, top + height * 0.42, width * 0.20, height * 0.32, Math.PI, Math.PI * 2, 12);
        addArc(left + width * 0.66, top + height * 0.48, width * 0.17, height * 0.28, Math.PI, Math.PI * 2, 10);
        addArc(right - width * 0.18, cy + height * 0.03, width * 0.18, height * 0.22, -Math.PI / 2, Math.PI / 2, 10);
        pts.push({ x: left + width * 0.82, y: bottom }, { x: left + width * 0.18, y: bottom });
        for (let i = 0; i < pts.length - 1; i++) segments.push(makeSegment(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
        segments.push(makeSegment(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y));
      } else if (selectedShape === 'grid') {
        for (let r = 0; r <= gridRows; r++) {
          const y = top + (height * r) / gridRows;
          segments.push(makeSegment(left, y, right, y));
        }
        for (let c = 0; c <= gridCols; c++) {
          const x = left + (width * c) / gridCols;
          segments.push(makeSegment(x, top, x, bottom));
        }
      }

      return segments;
    },
    [selectedColor, selectedSize, selectedShape, gridRows, gridCols]
  );

  // Draw the currently dragged shape as a live, non-persistent preview.
  // The preview is painted over a freshly redrawn board so it never becomes
  // part of the synchronized whiteboard history until pointer-up.
  const drawShapePreview = useCallback(
    (x1: number, y1: number, x2: number, y2: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const segments = getShapeSegments(x1, y1, x2, y2);
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = Math.max(1, selectedSize);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([8, 6]);

      for (const seg of segments) {
        ctx.beginPath();
        ctx.moveTo(seg.prevX * width, seg.prevY * height);
        ctx.lineTo(seg.currX * width, seg.currY * height);
        ctx.stroke();
      }

      ctx.restore();
    },
    [getShapeSegments, selectedColor, selectedSize]
  );

  const commitText = useCallback(() => {
    if (!textInsertPos) return;
    const value = textDraft;
    if (value.trim()) {
      onText?.({
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text: value,
        x: textInsertPos.x,
        y: textInsertPos.y,
        color: selectedColor,
        size: Math.max(14, selectedSize * 4),
        rotation: 0,
      });
    }
    setTextDraft('');
    setTextInsertPos(null);
    setEditingTextId(null);
  }, [onText, selectedColor, selectedSize, textDraft, textInsertPos]);

  // Eraser hit-testing for text objects. Text lives in the SVG object layer,
  // so the freehand eraser needs its own hit-test when the canvas receives the
  // pointer event. The bounds are deliberately generous to make erasing easy.
  const eraseTextAtPoint = useCallback((point: { x: number; y: number }) => {
    if (!onTextDelete || whiteboardTexts.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const boardWidth = canvas.width / dpr;
    const boardHeight = canvas.height / dpr;
    const px = point.x * boardWidth;
    const py = point.y * boardHeight;
    const padding = Math.max(eraserSize / 2, 6);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    for (const text of whiteboardTexts) {
      if (erasedTextIdsRef.current.has(text.id)) continue;
      ctx.save();
      ctx.font = `${text.size}px Inter, Arial, sans-serif`;
      const lines = text.text.split('\n');
      const width = Math.max(1, ...lines.map(line => ctx.measureText(line).width));
      const lineHeight = text.size * 1.2;
      const left = text.x * boardWidth - padding;
      const right = text.x * boardWidth + width + padding;
      const top = text.y * boardHeight - text.size - padding;
      const bottom = text.y * boardHeight + Math.max(lineHeight, lines.length * lineHeight) + padding;
      ctx.restore();

      // Axis-aligned bounds are used for rotated text too; this makes the
      // eraser forgiving rather than requiring a precise rotation calculation.
      if (px >= left && px <= right && py >= top && py <= bottom) {
        erasedTextIdsRef.current.add(text.id);
        onTextDelete(text.id);
      }
    }
  }, [eraserSize, onTextDelete, whiteboardTexts]);

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit) return;
    const point = getCoordinates(e);
    if (activeTool === 'eraser') {
      erasedTextIdsRef.current.clear();
      eraseTextAtPoint(point);
    }
    if (activeTool === 'text') {
      // Word-like text insertion: click exactly where the text should begin.
      setEditingTextId(null);
      setTextDraft('');
      setTextInsertPos(point);
      // Do not capture the canvas pointer for text. The textarea is a real HTML
      // input layered above the canvas and is focused after it mounts.
      return;
    }

    canvasRef.current?.setPointerCapture?.(e.pointerId);

    if (activeTool === 'rect-erase' || activeTool === 'shape') {
      selectionStartRef.current = point;
      const container = containerRef.current;
      const widthPx = container?.clientWidth || 0;
      setSelectionRect({ x: point.x * widthPx, y: point.y * BOARD_HEIGHT, w: 0, h: 0 });
      return;
    }

    // A single click creates a dot immediately. If the pointer then moves,
    // subsequent segments are added to the same stroke.
    isDrawingRef.current = true;
    currentLocalStrokeRef.current = [];
    redoStrokesRef.current = [];
    const dot: DrawLinePayload = makeSegment(point.x, point.y, point.x, point.y);
    dot.isEraser = activeTool === 'eraser';
    drawSegment(dot.prevX, dot.prevY, dot.currX, dot.currY, dot.color, dot.size, dot.isEraser);
    currentLocalStrokeRef.current.push(dot);
    onDraw(dot);
    lastPointRef.current = point;
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCoordinates(e); setPointerPos(point); onCursor?.({ x: point.x, y: point.y, visible: true });
    if (!canEdit) return;
    if (activeTool === 'eraser') eraseTextAtPoint(point);
    try { canvasRef.current?.releasePointerCapture?.(e.pointerId); } catch {}
    if (activeTool === 'rect-erase' || activeTool === 'shape') {
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

      // Shapes are previewed continuously while dragging. The actual shape
      // is only committed to history on pointer-up.
      if (activeTool === 'shape') {
        redrawAll();
        drawShapePreview(start.x, start.y, curr.x, curr.y);
      }
      return;
    }

    if (!isDrawingRef.current || !lastPointRef.current) return;
    const currPoint = getCoordinates(e);
    const prevPoint = lastPointRef.current;

    const isEraser = activeTool === 'eraser';
    const effectiveSize = isEraser ? eraserSize : selectedSize;
    const segment: DrawLinePayload = {
      prevX: prevPoint.x,
      prevY: prevPoint.y,
      currX: currPoint.x,
      currY: currPoint.y,
      color: selectedColor,
      size: effectiveSize,
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
    if (activeTool === 'rect-erase' || activeTool === 'shape') {
      if (selectionStartRef.current) {
        const start = selectionStartRef.current;
        const end = getCoordinates(e);
        const dx = Math.abs(end.x - start.x);
        const dy = Math.abs(end.y - start.y);

        if (activeTool === 'rect-erase') {
          const rect: EraseRectPayload = { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
          if (dx > 0.002 || dy > 0.002) {
            applyEraseRect(rect);
            // Delete text objects whose insertion point is inside the selected
            // rectangle as well as the drawn strokes. The server mirrors this
            // operation for everyone else in the meeting.
            if (onTextDelete) {
              const x1 = Math.min(rect.x1, rect.x2);
              const x2 = Math.max(rect.x1, rect.x2);
              const y1 = Math.min(rect.y1, rect.y2);
              const y2 = Math.max(rect.y1, rect.y2);
              for (const text of whiteboardTexts) {
                if (text.x >= x1 && text.x <= x2 && text.y >= y1 && text.y <= y2) {
                  onTextDelete(text.id);
                }
              }
            }
            onEraseRect(rect);
          }
        } else if (dx > 0.003 || dy > 0.003) {
          const shape: WhiteboardShape = {
            id: `shape-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            type: selectedShape, x: Math.min(start.x,end.x), y: Math.min(start.y,end.y),
            width: Math.abs(end.x-start.x),
            height: Math.abs(end.y-start.y), color:selectedColor, size:selectedSize, rotation:0,
            rows:gridRows, cols:gridCols, xValues:Math.max(1, Math.max(Math.abs(graphXMin), Math.abs(graphXMax))), yValues:Math.max(1, Math.max(Math.abs(graphYMin), Math.abs(graphYMax))), xInterval:graphXInterval, yInterval:graphYInterval, xMin:graphXMin, xMax:graphXMax, yMin:graphYMin, yMax:graphYMax
          };
          onShape?.(shape);
          setSelectedObjectId(shape.id);
        }
      }
      selectionStartRef.current = null;
      setSelectionRect(null);
      erasedTextIdsRef.current.clear();
      return;
    }

    if (isDrawingRef.current && currentLocalStrokeRef.current.length > 0) {
      allStrokesRef.current.push(currentLocalStrokeRef.current);
      currentLocalStrokeRef.current = [];
      onStrokeEnd();
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
    erasedTextIdsRef.current.clear();
  };

  // Broadcast our scroll position when we're the host, so viewers stay on
  // par with whatever part of the board we're currently writing on.
  const scrollRafRef = useRef<number | null>(null);
  const handleContainerScroll = () => {
    if (!canEdit) return;
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
    redoStrokesRef.current = [];
    remoteBuffersRef.current.clear();
    currentLocalStrokeRef.current = [];
    paintBackground();
    onAsset?.(null);
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
          {/* Pen / Eraser / Shape / Rect-erase Toggle */}
          <div className="flex items-center bg-dark-surface rounded-xl p-0.5 border border-dark-border">
            <button
              onClick={() => setActiveTool('pen')}
              title="Pen tool — click once for a dot"
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
              onClick={() => setActiveTool('shape')}
              title="Shape / grid tool"
              className={`p-1.5 rounded-lg transition-colors ${
                activeTool === 'shape' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Square className="w-4 h-4" />
            </button>
            <button onClick={() => setActiveTool('text')} title="Type text on the whiteboard" className={`p-1.5 rounded-lg transition-colors ${activeTool === 'text' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}><Type className="w-4 h-4" /></button>
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

          {/* Shape palette — drag to choose any size */}
          {activeTool === 'shape' && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-dark-surface rounded-xl border border-dark-border">
              {[
                ['rectangle', Square],
                ['rounded-rectangle', Square],
                ['ellipse', Circle],
                ['line', Minus],
                ['arrow', ArrowUpRight],
                ['triangle', Triangle],
                ['diamond', Diamond],
                ['pentagon', Hexagon],
                ['hexagon', Hexagon],
                ['octagon', Octagon],
                ['star', Star],
                ['heart', Heart],
                ['cloud', Cloud],
                ['grid', Grid3X3],
                ['graph', Grid3X3],
              ].map(([shape, Icon]: any) => (
                <button
                  key={shape}
                  onClick={() => setSelectedShape(shape)}
                  title={shape === 'grid' ? 'Grid / table' : String(shape)}
                  className={`p-1.5 rounded-lg transition-colors ${selectedShape === shape ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          )}

          {/* Color Palette (Shapes) */}
          {activeTool === 'shape' && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-dark-surface rounded-xl border border-dark-border" title="Shape color">
              {COLORS.map((c) => (
                <button
                  key={`shape-${c}`}
                  onClick={() => setSelectedColor(c)}
                  className={`w-4 h-4 rounded-full transition-transform ${selectedColor === c ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                  title={`Shape color ${c}`}
                  aria-label={`Shape color ${c}`}
                />
              ))}
            </div>
          )}

          {activeTool === 'shape' && selectedShape === 'graph' && (
            <div className="flex items-center gap-1.5 bg-dark-surface rounded-xl border border-dark-border px-2 py-1 text-xs">
              <span className="text-brand-400 font-semibold">XY</span>
              <label className="text-slate-400">X min<input type="number" min={-100} max={99} value={graphXMin} onChange={e=>setGraphXMin(Math.max(-100,Math.min(graphXMax-1,Number(e.target.value)||0)))} className="ml-1 w-12 bg-dark-card border border-dark-border rounded px-1 py-0.5 text-slate-100"/></label>
              <label className="text-slate-400">X max<input type="number" min={-99} max={100} value={graphXMax} onChange={e=>setGraphXMax(Math.min(100,Math.max(graphXMin+1,Number(e.target.value)||1)))} className="ml-1 w-12 bg-dark-card border border-dark-border rounded px-1 py-0.5 text-slate-100"/></label>
              <label className="text-slate-400">X step<input type="number" min={0.01} step={0.5} value={graphXInterval} onChange={e=>setGraphXInterval(Math.max(.01,Number(e.target.value)||1))} className="ml-1 w-12 bg-dark-card border border-dark-border rounded px-1 py-0.5 text-slate-100"/></label>
              <label className="text-slate-400">Y min<input type="number" min={-100} max={99} value={graphYMin} onChange={e=>setGraphYMin(Math.max(-100,Math.min(graphYMax-1,Number(e.target.value)||0)))} className="ml-1 w-12 bg-dark-card border border-dark-border rounded px-1 py-0.5 text-slate-100"/></label>
              <label className="text-slate-400">Y max<input type="number" min={-99} max={100} value={graphYMax} onChange={e=>setGraphYMax(Math.min(100,Math.max(graphYMin+1,Number(e.target.value)||1)))} className="ml-1 w-12 bg-dark-card border border-dark-border rounded px-1 py-0.5 text-slate-100"/></label>
              <label className="text-slate-400">Y step<input type="number" min={0.01} step={0.5} value={graphYInterval} onChange={e=>setGraphYInterval(Math.max(.01,Number(e.target.value)||1))} className="ml-1 w-12 bg-dark-card border border-dark-border rounded px-1 py-0.5 text-slate-100"/></label>
            </div>
          )}

          {activeTool === 'shape' && selectedShape === 'grid' && (
            <div className="flex items-center gap-1.5 bg-dark-surface rounded-xl border border-dark-border px-2 py-1 text-xs">
              <Grid3X3 className="w-3.5 h-3.5 text-brand-400" />
              <label className="text-slate-400">Rows
                <input type="number" min={1} max={20} value={gridRows} onChange={(e) => setGridRows(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="ml-1 w-10 bg-dark-card border border-dark-border rounded px-1 py-0.5 text-slate-100" />
              </label>
              <label className="text-slate-400">Cols
                <input type="number" min={1} max={20} value={gridCols} onChange={(e) => setGridCols(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="ml-1 w-10 bg-dark-card border border-dark-border rounded px-1 py-0.5 text-slate-100" />
              </label>
            </div>
          )}

          {activeTool === 'text' && (
            <>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-dark-surface rounded-xl border border-dark-border">
                <span className="text-[10px] text-slate-400">Text colour</span>
                {COLORS.map(c=><button key={`text-${c}`} onClick={()=>setSelectedColor(c)} className={`w-4 h-4 rounded-full ${selectedColor===c?'scale-125 ring-2 ring-white':''}`} style={{backgroundColor:c}} title={c}/>)}
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-dark-surface rounded-xl border border-dark-border max-w-[520px] overflow-x-auto">
                {['√','x²','xⁿ','x₁','x₂','π','∞','≤','≥','≠','±','∑','∏','∫','∂','Δ','θ','α','β','γ','λ','μ','σ','°','′','″','→','↔','≈','∈','⊂','∪','∩','|x|'].map(sym=><button key={sym} onClick={()=>setTextDraft(v=>v+sym)} className="px-1.5 py-1 rounded bg-dark-card text-xs text-slate-300 hover:text-white hover:bg-dark-hover whitespace-nowrap">{sym}</button>)}
              </div>
            </>
          )}

          {activeTool === 'eraser' && (
            <div className="flex items-center gap-2 px-2 py-1 bg-dark-surface rounded-xl border border-dark-border">
              <span className="text-[10px] text-slate-400">Eraser</span><input type="range" min="8" max="80" value={eraserSize} onChange={e=>setEraserSize(Number(e.target.value))} className="w-28" /><span className="text-[10px] text-slate-300 w-7">{eraserSize}px</span>
            </div>
          )}

          {whiteboardAsset && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-dark-surface rounded-xl border border-dark-border text-xs">
              <span className="text-slate-400">Document</span>
              <button onClick={()=>setAssetZoom(z=>Math.max(50,z-10))} className="px-1.5 py-1 rounded bg-dark-card hover:bg-dark-hover text-slate-300" aria-label="Zoom out">−</button>
              <span className="min-w-[42px] text-center text-slate-200 font-semibold">{assetZoom}%</span>
              <button onClick={()=>setAssetZoom(z=>Math.min(200,z+10))} className="px-1.5 py-1 rounded bg-dark-card hover:bg-dark-hover text-slate-300" aria-label="Zoom in">+</button>
              <button onClick={()=>setAssetZoom(100)} className="px-1.5 py-1 rounded bg-dark-card hover:bg-dark-hover text-slate-400">100%</button>
            </div>
          )}

          <label className="p-2 rounded-xl bg-dark-surface hover:bg-dark-hover border border-dark-border text-slate-300 cursor-pointer" title="Upload image or PDF to whiteboard">
            <Upload className="w-4 h-4" /><input type="file" accept="image/*,application/pdf" className="hidden" onChange={async e=>{ const file=e.target.files?.[0]; if(!file || !canEdit) return; if(file.size>8*1024*1024){ alert('Please use a file smaller than 8 MB.'); return; } const reader=new FileReader(); reader.onload=()=>onAsset?.({id:`asset-${Date.now()}`,kind:file.type==='application/pdf'?'pdf':'image',name:file.name,dataUrl:String(reader.result)}); reader.readAsDataURL(file); e.currentTarget.value=''; }} />
          </label>

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

          {/* Undo / Redo */}
          <div className="flex items-center bg-dark-surface rounded-xl p-0.5 border border-dark-border">
            <button
              onClick={handleUndo}
              disabled={allStrokesRef.current.length === 0}
              title="Undo"
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStrokesRef.current.length === 0}
              title="Redo / bring back last undone action"
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

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

          <ThemeToggle />
          <button
            onClick={() => setShowVideoStrip((prev) => !prev)}
            title={showVideoStrip ? 'Minimize participant videos' : 'Show participant videos'}
            aria-label={showVideoStrip ? 'Minimize participant videos' : 'Show participant videos'}
            className="p-2 rounded-xl bg-dark-surface hover:bg-dark-hover border border-dark-border text-slate-300 hover:text-white transition-colors"
          >
            {showVideoStrip ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Canvas Main Stage + Docked Video Strip */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 overflow-hidden">
        {/* Interactive Whiteboard Canvas — scrolls vertically like a document */}
        <div
          ref={containerRef}
          onScroll={handleContainerScroll}
          className={`flex-1 bg-slate-900 boom-whiteboard-surface rounded-2xl border border-dark-border overflow-y-auto overflow-x-hidden relative shadow-2xl touch-none ${canEdit ? 'cursor-crosshair' : 'cursor-default'}`}
        >
          <div className="absolute top-0 left-0 right-0 pointer-events-none z-0 flex items-start justify-center overflow-visible" style={{height: BOARD_HEIGHT}}>
            {whiteboardAsset?.kind === 'image' && (
              <div className="w-full flex justify-center" style={{transform:`scale(${assetZoom/100})`, transformOrigin:'top center'}}>
                <img src={whiteboardAsset.dataUrl} alt={whiteboardAsset.name} className="w-full h-auto object-contain" />
              </div>
            )}
            {whiteboardAsset?.kind === 'pdf' && (
              <div className="w-full h-full flex justify-center" style={{transform:`scale(${assetZoom/100})`, transformOrigin:'top center'}}>
                <iframe src={whiteboardAsset.dataUrl} title={whiteboardAsset.name} className="w-full h-full border-0" />
              </div>
            )}
          </div>
          <div className="absolute top-0 left-0 right-0 pointer-events-none z-30" style={{height: BOARD_HEIGHT}}>
            {Array.from(remoteCursors.values()).map(c => <div key={c.participantId} className="absolute" style={{left:`${c.x*100}%`, top:`${c.y*BOARD_HEIGHT}px`}}><MousePointer2 className="w-5 h-5 text-brand-500 fill-brand-500"/><span className="ml-1 px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px]">{c.displayName}</span></div>)}
            {activeTool === 'eraser' && pointerPos && <div className="absolute rounded-full border-2 border-rose-400 bg-rose-400/10" style={{left:`calc(${pointerPos.x*100}% - ${eraserSize/2}px)`, top:`${pointerPos.y*BOARD_HEIGHT-eraserSize/2}px`, width:eraserSize, height:eraserSize}}/>}
          </div>
          <WhiteboardObjectsLayer
            shapes={whiteboardShapes}
            texts={whiteboardTexts}
            boardHeight={BOARD_HEIGHT}
            boardWidth={containerRef.current?.clientWidth || 1}
            canEdit={canEdit}
            selectedId={selectedObjectId}
            onSelect={setSelectedObjectId}
            onShapeUpdate={(shape)=>onShapeUpdate?.(shape)}
            onTextUpdate={(text)=>onTextUpdate?.(text)}
            onTextDelete={onTextDelete}
            interactionEnabled={activeTool !== 'shape' && activeTool !== 'text' && activeTool !== 'eraser'}
          />
          {textInsertPos && canEdit && (
            <div
              className="absolute z-[70] pointer-events-auto"
              style={{
                left: `${textInsertPos.x * 100}%`,
                top: `${textInsertPos.y * BOARD_HEIGHT}px`,
                transform: 'translate(0, 0)',
              }}
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              <textarea
                ref={textEditorRef}
                id="boom-text-editor"
                value={textDraft}
                onChange={e => setTextDraft(e.target.value)}
                onPointerDown={e => e.stopPropagation()}
                onPointerMove={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
                onFocus={() => setActiveTool('text')}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setTextDraft('');
                    setTextInsertPos(null);
                    return;
                  }

                  // Ctrl/Cmd + Enter commits. Plain Enter creates a new line.
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    commitText();
                  }
                }}
                className="block min-w-[260px] min-h-[52px] resize both bg-transparent border-2 border-brand-500 rounded-md outline-none px-2 py-1 leading-tight pointer-events-auto select-text"
                style={{
                  color: selectedColor,
                  fontSize: Math.max(14, selectedSize * 4),
                  lineHeight: 1.2,
                }}
                placeholder="Type here…"
                rows={2}
                spellCheck
              />
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[11px] text-slate-400">
                  Enter = new line · Ctrl+Enter = finish
                </span>
                <button
                  type="button"
                  className="ml-auto rounded-md bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation();
                    commitText();
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          <canvas
            ref={canvasRef}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={(e) => { onCursor?.({x:0,y:0,visible:false}); setPointerPos(null); stopDrawing(e); }}
            className={`block relative z-10 ${canEdit ? '' : 'pointer-events-none'}`}
          />

          {/* Rectangle-select eraser overlay (drag to mark an area for deletion) */}
          {selectionRect && activeTool === 'rect-erase' && (
            <div
              className="absolute z-50 border-2 border-dashed border-rose-400 bg-rose-400/10 pointer-events-none"
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