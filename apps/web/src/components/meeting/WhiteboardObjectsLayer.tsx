import React, { useRef, useState } from 'react';
import type { WhiteboardShape, WhiteboardText } from '@boom/types';

interface Props {
  shapes: WhiteboardShape[];
  texts: WhiteboardText[];
  boardHeight: number;
  boardWidth: number;
  canEdit: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onShapeUpdate: (shape: WhiteboardShape) => void;
  onTextUpdate: (text: WhiteboardText) => void;
  onTextDelete?: (textId: string) => void;
  onLongPress?: (id: string, type: 'shape'|'text') => void;
  /** When false, the layer is visual-only so drawing/text placement can pass through existing objects. */
  interactionEnabled?: boolean;
}

const LONG_PRESS_MS = 550;

function pointsForShape(s: WhiteboardShape) {
  const {x,y,width:w,height:h}=s; const cx=x+w/2, cy=y+h/2;
  const regular=(n:number)=>Array.from({length:n},(_,i)=>{const a=-Math.PI/2+i*Math.PI*2/n;return `${cx+Math.cos(a)*w/2},${cy+Math.sin(a)*h/2}`}).join(' ');
  if(s.type==='triangle') return `${cx},${y} ${x+w},${y+h} ${x},${y+h}`;
  if(s.type==='diamond') return `${cx},${y} ${x+w},${cy} ${cx},${y+h} ${x},${cy}`;
  if(s.type==='pentagon') return regular(5);
  if(s.type==='hexagon') return regular(6);
  if(s.type==='octagon') return regular(8);
  if(s.type==='star') { const pts=[]; for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5;const r=i%2?w*.225:w*.5;const ry=i%2?h*.225:h*.5;pts.push(`${cx+Math.cos(a)*r},${cy+Math.sin(a)*ry}`)} return pts.join(' '); }
  return '';
}

function ShapeGraphic({s,boardWidth,boardHeight}:{s:WhiteboardShape;boardWidth:number;boardHeight:number}) {
  const x=s.x*boardWidth,y=s.y*boardHeight,w=s.width*boardWidth,h=s.height*boardHeight;
  const common={fill:'none',stroke:s.color,strokeWidth:Math.max(1,s.size),strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
  const regular=(n:number)=>Array.from({length:n},(_,i)=>{const a=-Math.PI/2+i*Math.PI*2/n;return `${x+w/2+Math.cos(a)*w/2},${y+h/2+Math.sin(a)*h/2}`}).join(' ');
  const poly=(pts:string)=><polygon points={pts} {...common}/>;
  switch(s.type){
    case 'ellipse': return <ellipse cx={x+w/2} cy={y+h/2} rx={Math.abs(w)/2} ry={Math.abs(h)/2} {...common}/>;
    case 'line': return <line x1={x} y1={y+h/2} x2={x+w} y2={y+h/2} {...common}/>;
    case 'arrow': return <><line x1={x} y1={y+h/2} x2={x+w} y2={y+h/2} {...common}/><polyline points={`${x+w-14},${y+h/2-8} ${x+w},${y+h/2} ${x+w-14},${y+h/2+8}`} {...common}/></>;
    case 'rounded-rectangle': return <rect x={x} y={y} width={w} height={h} rx={Math.min(Math.abs(w),Math.abs(h))*.16} {...common}/>;
    case 'rectangle': return <rect x={x} y={y} width={w} height={h} {...common}/>;
    case 'triangle': return poly(`${x+w/2},${y} ${x+w},${y+h} ${x},${y+h}`);
    case 'diamond': return poly(`${x+w/2},${y} ${x+w},${y+h/2} ${x+w/2},${y+h} ${x},${y+h/2}`);
    case 'pentagon': return poly(regular(5));
    case 'hexagon': return poly(regular(6));
    case 'octagon': return poly(regular(8));
    case 'star': { const pts=[]; for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5;const r=i%2?w*.225:w*.5;const ry=i%2?h*.225:h*.5;pts.push(`${x+w/2+Math.cos(a)*r},${y+h/2+Math.sin(a)*ry}`)} return poly(pts.join(' ')); }
    case 'heart': return <path d={`M ${x+w/2} ${y+h*.9} C ${x} ${y+h*.55}, ${x+w*.12} ${y}, ${x+w/2} ${y+h*.3} C ${x+w*.88} ${y}, ${x+w} ${y+h*.55}, ${x+w/2} ${y+h*.9}`} {...common}/>;
    case 'cloud': return <path d={`M ${x+w*.2} ${y+h*.75} C ${x} ${y+h*.65}, ${x+w*.05} ${y+h*.35}, ${x+w*.28} ${y+h*.4} C ${x+w*.35} ${y+h*.05}, ${x+w*.68} ${y+h*.05}, ${x+w*.72} ${y+h*.4} C ${x+w} ${y+h*.32}, ${x+w} ${y+h*.75}, ${x+w*.78} ${y+h*.78} Z`} {...common}/>;
    case 'grid': { const rows=s.rows||4,cols=s.cols||4; const lines=[]; for(let r=1;r<rows;r++)lines.push(<line key={'r'+r} x1={x} y1={y+h*r/rows} x2={x+w} y2={y+h*r/rows} {...common}/>); for(let c=1;c<cols;c++)lines.push(<line key={'c'+c} x1={x+w*c/cols} y1={y} x2={x+w*c/cols} y2={y+h} {...common}/>); return <g><rect x={x} y={y} width={w} height={h} {...common}/>{lines}</g>; }
    case 'graph': {
      const xMin = s.xMin ?? -(s.xValues || 5), xMax = s.xMax ?? (s.xValues || 5);
      const yMin = s.yMin ?? -(s.yValues || 5), yMax = s.yMax ?? (s.yValues || 5);
      const xi = s.xInterval || 1, yi = s.yInterval || 1;
      const xSpan = Math.max(1, xMax - xMin), ySpan = Math.max(1, yMax - yMin);
      const ox = xMin <= 0 && xMax >= 0 ? x + ((0-xMin)/xSpan)*w : null;
      const oy = yMin <= 0 && yMax >= 0 ? y+h-((0-yMin)/ySpan)*h : null;
      const yTickX = ox ?? x;
      const xTickY = oy ?? (y+h);
      const lines: React.ReactNode[] = [];
      for(let v=Math.ceil(xMin/xi)*xi; v<=xMax+xi*.001; v+=xi){ if(Math.abs(v)<xi*.0001) continue; const px=x+((v-xMin)/xSpan)*w; lines.push(<line key={'vx'+v} x1={px} y1={y} x2={px} y2={y+h} stroke={s.color} strokeOpacity=".18" strokeWidth="1"/>); }
      for(let v=Math.ceil(yMin/yi)*yi; v<=yMax+yi*.001; v+=yi){ if(Math.abs(v)<yi*.0001) continue; const py=y+h-((v-yMin)/ySpan)*h; lines.push(<line key={'hy'+v} x1={x} y1={py} x2={x+w} y2={py} stroke={s.color} strokeOpacity=".18" strokeWidth="1"/>); }
      return <g style={{pointerEvents:'none'}}>{lines}{oy!==null&&<line x1={x} y1={oy} x2={x+w} y2={oy} {...common}/>} {ox!==null&&<line x1={ox} y1={y+h} x2={ox} y2={y} {...common}/>} {Array.from({length:Math.min(201,Math.ceil((xMax-xMin)/xi)+1)},(_,i)=>{const v=Math.ceil(xMin/xi)*xi+i*xi;if(v>xMax+xi*.001||Math.abs(v)<xi*.0001)return null; const px=x+((v-xMin)/xSpan)*w; const labelY=(oy ?? (y+h))+16; return <text key={'xl'+i} x={px+3} y={labelY} fontSize="11" fill={s.color}>{Number(v.toFixed(6))}</text>})}{Array.from({length:Math.min(201,Math.ceil((yMax-yMin)/yi)+1)},(_,i)=>{const v=Math.ceil(yMin/yi)*yi+i*yi;if(v>yMax+yi*.001||Math.abs(v)<yi*.0001)return null; const py=y+h-((v-yMin)/ySpan)*h; const labelX=(ox ?? x)+5; return <text key={'yl'+i} x={labelX} y={py+12} fontSize="11" fill={s.color}>{Number(v.toFixed(6))}</text>})}</g>; }
  }
}


export const WhiteboardObjectsLayer: React.FC<Props> = ({
  shapes,texts,boardHeight,boardWidth,canEdit,selectedId,onSelect,onShapeUpdate,onTextUpdate,onTextDelete,onLongPress,
  interactionEnabled = true,
}) => {
  const timers=useRef<Map<string,number>>(new Map());
  const svgRef=useRef<SVGSVGElement|null>(null);
  const [drag,setDrag]=useState<{id:string;type:'shape'|'text'|'rotate';startX:number;startY:number;orig:any;cx?:number;cy?:number}|null>(null);
  const [progress,setProgress]=useState<{id:string;x:number;y:number;value:number}|null>(null);
  const start=(e:React.PointerEvent,id:string,type:'shape'|'text',obj:any)=>{
    if(!canEdit)return; e.stopPropagation(); (e.currentTarget as Element).setPointerCapture?.(e.pointerId); onSelect(id); const startX=e.clientX,startY=e.clientY; const timer=window.setTimeout(()=>{setDrag({id,type,startX,startY,orig:{...obj}});onLongPress?.(id,type);setProgress(null);},LONG_PRESS_MS); timers.current.set(id,timer);
    const began=performance.now(); const tick=()=>{if(!timers.current.has(id))return;const v=Math.min(1,(performance.now()-began)/LONG_PRESS_MS);const r=svgRef.current?.getBoundingClientRect(); if(r) setProgress({id,x:e.clientX-r.left,y:e.clientY-r.top,value:v});if(v<1)requestAnimationFrame(tick)};requestAnimationFrame(tick);
  };
  const move=(e:React.PointerEvent)=>{if(!drag)return; const dx=(e.clientX-drag.startX)/boardWidth,dy=(e.clientY-drag.startY)/boardHeight;if(drag.type==='rotate'){const a=Math.atan2(e.clientY-(drag.cy||0),e.clientX-(drag.cx||0));const b=Math.atan2(drag.startY-(drag.cy||0),drag.startX-(drag.cx||0));onShapeUpdate({...drag.orig,rotation:(drag.orig.rotation||0)+(a-b)*180/Math.PI});return;} if(drag.type==='shape'){onShapeUpdate({...drag.orig,x:drag.orig.x+dx,y:drag.orig.y+dy});}else onTextUpdate({...drag.orig,x:drag.orig.x+dx,y:drag.orig.y+dy});};
  const end=(id:string)=>{const t=timers.current.get(id);if(t)clearTimeout(t);timers.current.delete(id);setProgress(null);setDrag(null);};
  return <svg ref={svgRef} className="absolute inset-0 z-20 pointer-events-none" width={boardWidth} height={boardHeight} viewBox={`0 0 ${boardWidth} ${boardHeight}`}>
    <g className={interactionEnabled ? "pointer-events-auto" : "pointer-events-none"} onPointerMove={interactionEnabled ? move : undefined}>
      {shapes.map(s=><g key={s.id} transform={`rotate(${s.rotation} ${(s.x+s.width/2)*boardWidth} ${(s.y+s.height/2)*boardHeight})`} onPointerDown={e=>start(e,s.id,'shape',s)} onPointerMove={move} onPointerUp={()=>end(s.id)} onPointerCancel={()=>end(s.id)} style={{cursor:canEdit?'grab':'default'}}><ShapeGraphic s={s} boardWidth={boardWidth} boardHeight={boardHeight}/>{selectedId===s.id&&canEdit&&<circle cx={(s.x+s.width/2)*boardWidth} cy={s.y*boardHeight-16} r="6" fill="white" stroke={s.color} strokeWidth="2" onPointerDown={e=>{e.stopPropagation();(e.currentTarget as Element).setPointerCapture?.(e.pointerId);setDrag({id:s.id,type:'rotate',startX:e.clientX,startY:e.clientY,orig:{...s},cx:(s.x+s.width/2)*boardWidth,cy:(s.y+s.height/2)*boardHeight});}} onPointerUp={()=>end(s.id)}/>}</g>)}
      {texts.map(t=><g key={t.id} transform={`rotate(${t.rotation||0} ${t.x*boardWidth} ${t.y*boardHeight})`} onPointerDown={e=>start(e,t.id,'text',t)} onPointerMove={move} onPointerUp={()=>end(t.id)} onPointerCancel={()=>end(t.id)} style={{cursor:canEdit?'grab':'default'}}>
        <text x={t.x*boardWidth} y={t.y*boardHeight} fontSize={t.size} fill={t.color}>
          {t.text.split('\n').map((line,i)=><tspan key={i} x={t.x*boardWidth} dy={i===0 ? 0 : t.size*1.2}>{line}</tspan>)}
        </text>
      </g>)}
    </g>
    {progress&&<g><circle cx={progress.x} cy={progress.y} r="14" fill="rgba(0,0,0,.65)"/><circle cx={progress.x} cy={progress.y} r="11" fill="none" stroke="white" strokeWidth="3" strokeDasharray={`${2*Math.PI*11}`} strokeDashoffset={`${2*Math.PI*11*(1-progress.value)}`} transform={`rotate(-90 ${progress.x} ${progress.y})`}/></g>}
  </svg>;
};
