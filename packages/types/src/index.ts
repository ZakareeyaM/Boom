// User types
export interface User { id: string; name: string; email: string; avatarUrl?: string; createdAt: string; updatedAt: string; }
export interface AuthSession { user: User; token: string; }
export interface AuthResponse { user: User; token: string; }
export type MeetingStatus = 'ACTIVE' | 'ENDED';
export interface Meeting { id: string; meetingCode: string; hostId: string; title?: string; status: MeetingStatus; createdAt: string; endedAt?: string; }
export interface Participant { id: string; userId?: string | null; meetingId: string; displayName: string; isHost: boolean; audioEnabled: boolean; videoEnabled: boolean; screenShareActive: boolean; joinedAt: string; }
export interface ChatMessage { id: string; meetingId: string; senderId: string; senderName: string; isHost: boolean; message: string; createdAt: string; }
export interface DrawLinePayload { prevX:number; prevY:number; currX:number; currY:number; color:string; size:number; isEraser:boolean; }
export interface WhiteboardState { isOpen:boolean; activePresenterId?:string; activePresenterName?:string; }
export interface EraseRectPayload { x1:number; y1:number; x2:number; y2:number; }
export interface WhiteboardAsset { id:string; kind:'image'|'pdf'; name:string; dataUrl:string; }
export interface WhiteboardSnapshot { history:DrawLinePayload[][]; asset:WhiteboardAsset|null; texts:WhiteboardText[]; shapes:WhiteboardShape[]; }
export interface WhiteboardCursor { participantId:string; displayName:string; x:number; y:number; visible:boolean; }
export interface WhiteboardText { id:string; text:string; x:number; y:number; color:string; size:number; rotation?:number; }
export type WhiteboardShapeType = 'rectangle'|'rounded-rectangle'|'ellipse'|'line'|'arrow'|'triangle'|'diamond'|'pentagon'|'hexagon'|'octagon'|'star'|'heart'|'cloud'|'grid'|'graph';
export interface WhiteboardShape { id:string; type:WhiteboardShapeType; x:number; y:number; width:number; height:number; color:string; size:number; rotation:number; rows?:number; cols?:number; xValues?:number; yValues?:number; xInterval?:number; yInterval?:number; xMin?:number; xMax?:number; yMin?:number; yMax?:number; }
export type ClientMeetingState = 'IDLE'|'PRE_JOIN'|'CONNECTING'|'CONNECTED'|'RECONNECTING'|'ENDING'|'ENDED'|'REMOVED'|'ERROR';
export type ConnectionQuality = 'EXCELLENT'|'UNSTABLE'|'POOR';
export interface WebRTCOfferPayload { targetSocketId:string; callerSocketId:string; callerName:string; sdp:RTCSessionDescriptionInit; }
export interface WebRTCAnswerPayload { targetSocketId:string; responderSocketId:string; sdp:RTCSessionDescriptionInit; }
export interface WebRTCIceCandidatePayload { targetSocketId:string; senderSocketId?:string; candidate:RTCIceCandidateInit; }
export interface ScreenShareRequest { requesterSocketId:string; requesterName:string; }
export interface WhiteboardEditRequest { requesterSocketId:string; requesterName:string; }

export interface ServerToClientEvents {
  'room:joined': (data:{meeting:Meeting;participant:Participant;participants:Participant[];messages:ChatMessage[];whiteboardState?:WhiteboardState;whiteboardHistory?:DrawLinePayload[][];whiteboardAsset?:WhiteboardAsset|null;whiteboardTexts?:WhiteboardText[];whiteboardShapes?:WhiteboardShape[];canUndo?:boolean;canRedo?:boolean})=>void;
  'participant:joined':(p:Participant)=>void; 'participant:left':(d:{participantId:string;displayName:string})=>void; 'participant:updated':(p:Participant)=>void;
  'participant:muted':(d:{participantId:string;mutedByHost:boolean;media?:'audio'|'video'})=>void; 'participant:removed':(d:{participantId:string;reason:string})=>void;
  'meeting:ended':(d:{reason:string})=>void; 'chat:message':(m:ChatMessage)=>void;
  'screenShare:started':(d:{participantId:string;displayName:string})=>void; 'screenShare:stopped':(d:{participantId:string})=>void; 'screenShare:requested':(d:ScreenShareRequest)=>void;
  'screenShare:permissionGranted':()=>void; 'screenShare:permissionDenied':(d:{reason:string})=>void; 'screenShare:permissionRevoked':(d:{reason:string})=>void; 'screenShare:forceStop':(d:{reason:string})=>void;
  'whiteboard:requested':(d:WhiteboardEditRequest)=>void; 'whiteboard:permissionGranted':()=>void; 'whiteboard:permissionDenied':(d:{reason:string})=>void; 'whiteboard:permissionRevoked':(d:{reason:string})=>void;
  'whiteboard:toggle':(s:WhiteboardState)=>void; 'whiteboard:draw':(d:{line:DrawLinePayload;senderId:string})=>void; 'whiteboard:strokeEnd':(d:{senderId:string})=>void;
  'whiteboard:undo':(d:{history:DrawLinePayload[][];asset:WhiteboardAsset|null;texts:WhiteboardText[];shapes?:WhiteboardShape[];canUndo?:boolean;canRedo?:boolean})=>void; 'whiteboard:redo':(d:{history:DrawLinePayload[][];asset:WhiteboardAsset|null;texts:WhiteboardText[];shapes?:WhiteboardShape[];canUndo?:boolean;canRedo?:boolean})=>void; 'whiteboard:snapshot':(d:{history:DrawLinePayload[][];asset:WhiteboardAsset|null;texts:WhiteboardText[];shapes?:WhiteboardShape[];canUndo?:boolean;canRedo?:boolean})=>void; 'whiteboard:historyState':(d:{canUndo:boolean;canRedo:boolean})=>void;
  'whiteboard:clear':()=>void; 'whiteboard:scroll':(d:{scrollTop:number})=>void; 'whiteboard:text':(d:{text:WhiteboardText})=>void; 'whiteboard:textUpdate':(d:{text:WhiteboardText})=>void; 'whiteboard:textDelete':(d:{textId:string})=>void; 'whiteboard:eraseRect':(d:{rect:EraseRectPayload})=>void;
  'whiteboard:cursor':(d:WhiteboardCursor)=>void; 'whiteboard:asset':(d:{asset:WhiteboardAsset|null})=>void; 'whiteboard:shape':(d:{shape:WhiteboardShape})=>void; 'whiteboard:shapeUpdate':(d:{shape:WhiteboardShape})=>void; 'whiteboard:shapeDelete':(d:{shapeId:string})=>void;
  'webrtc:offer':(p:WebRTCOfferPayload)=>void; 'webrtc:answer':(p:WebRTCAnswerPayload)=>void; 'webrtc:ice-candidate':(p:WebRTCIceCandidatePayload)=>void;
  'error':(d:{code:string;message:string})=>void;
}
export interface ClientToServerEvents {
  'meeting:join':(d:{meetingCode:string;displayName:string;audioEnabled:boolean;videoEnabled:boolean},cb:(r:{success:boolean;error?:string;data?:any})=>void)=>void;
  'meeting:leave':()=>void; 'meeting:end':(cb?:(r:{success:boolean;error?:string})=>void)=>void; 'participant:toggleMedia':(d:{audioEnabled?:boolean;videoEnabled?:boolean})=>void;
  'participant:mute':(d:{targetParticipantId:string;media?:'audio'|'video'})=>void; 'participant:remove':(d:{targetParticipantId:string})=>void;
  'screenShare:request':()=>void; 'screenShare:requestResponse':(d:{requesterSocketId:string;approved:boolean})=>void; 'screenShare:revoke':(d:{targetParticipantId:string})=>void; 'screenShare:start':()=>void; 'screenShare:stop':()=>void;
  'whiteboard:request':()=>void; 'whiteboard:requestResponse':(d:{requesterSocketId:string;approved:boolean})=>void; 'whiteboard:revoke':(d:{targetParticipantId:string})=>void;
  'whiteboard:toggle':(d:{isOpen:boolean})=>void; 'whiteboard:draw':(d:{line:DrawLinePayload})=>void; 'whiteboard:strokeEnd':()=>void; 'whiteboard:undo':()=>void; 'whiteboard:redo':()=>void; 'whiteboard:clear':()=>void;
  'whiteboard:scroll':(d:{scrollTop:number})=>void; 'whiteboard:text':(d:{text:WhiteboardText})=>void; 'whiteboard:textUpdate':(d:{text:WhiteboardText})=>void; 'whiteboard:textDelete':(d:{textId:string})=>void; 'whiteboard:eraseRect':(d:{rect:EraseRectPayload})=>void; 'whiteboard:cursor':(d:Omit<WhiteboardCursor,'participantId'|'displayName'>)=>void; 'whiteboard:asset':(d:{asset:WhiteboardAsset|null})=>void; 'whiteboard:shape':(d:{shape:WhiteboardShape})=>void; 'whiteboard:shapeUpdate':(d:{shape:WhiteboardShape})=>void; 'whiteboard:shapeDelete':(d:{shapeId:string})=>void;
  'chat:send':(d:{message:string})=>void; 'webrtc:offer':(p:WebRTCOfferPayload)=>void; 'webrtc:answer':(p:WebRTCAnswerPayload)=>void; 'webrtc:ice-candidate':(p:WebRTCIceCandidatePayload)=>void;
}
export interface MeetingHistoryItem { id:string; meetingCode:string; title:string; createdAt:string; endedAt?:string; durationMinutes:number; participantCount:number; isHost:boolean; }
