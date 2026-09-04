// User types
export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: User;
  token: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// Meeting Types & Lifecycle
export type MeetingStatus = 'ACTIVE' | 'ENDED';

export interface Meeting {
  id: string;
  meetingCode: string; // e.g. "AB7X-K92P"
  hostId: string;
  title?: string;
  status: MeetingStatus;
  createdAt: string;
  endedAt?: string;
}

export interface Participant {
  id: string; // Socket ID or persistent participant ID
  userId?: string | null;
  meetingId: string;
  displayName: string;
  isHost: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareActive: boolean;
  joinedAt: string;
}

export interface ChatMessage {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string;
  isHost: boolean;
  message: string;
  createdAt: string;
}

// Whiteboard Types
export interface DrawLinePayload {
  prevX: number; // Normalized 0..1
  prevY: number; // Normalized 0..1
  currX: number; // Normalized 0..1
  currY: number; // Normalized 0..1
  color: string;
  size: number;
  isEraser: boolean;
}

export interface WhiteboardState {
  isOpen: boolean;
  activePresenterId?: string;
  activePresenterName?: string;
}

export interface EraseRectPayload {
  x1: number; // Normalized 0..1, relative to full (tall) canvas
  y1: number;
  x2: number;
  y2: number;
}

// Meeting Lifecycle States for Client State Machine
export type ClientMeetingState =
  | 'IDLE'
  | 'PRE_JOIN'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ENDING'
  | 'ENDED'
  | 'REMOVED'
  | 'ERROR';

// Connection Quality
export type ConnectionQuality = 'EXCELLENT' | 'UNSTABLE' | 'POOR';

// WebRTC Signaling Types
export interface WebRTCOfferPayload {
  targetSocketId: string;
  callerSocketId: string;
  callerName: string;
  sdp: RTCSessionDescriptionInit;
}

export interface WebRTCAnswerPayload {
  targetSocketId: string;
  responderSocketId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface WebRTCIceCandidatePayload {
  targetSocketId: string;
  senderSocketId?: string;
  candidate: RTCIceCandidateInit;
}

// Screen Share Permission Types
export interface ScreenShareRequest {
  requesterSocketId: string;
  requesterName: string;
}

export interface WhiteboardEditRequest {
  requesterSocketId: string;
  requesterName: string;
}

// Socket Events Definition
export interface ServerToClientEvents {
  'room:joined': (data: {
    meeting: Meeting;
    participant: Participant;
    participants: Participant[];
    messages: ChatMessage[];
    whiteboardState?: WhiteboardState;
  }) => void;
  'participant:joined': (participant: Participant) => void;
  'participant:left': (data: { participantId: string; displayName: string }) => void;
  'participant:updated': (participant: Participant) => void;
  'participant:muted': (data: { participantId: string; mutedByHost: boolean; media?: 'audio' | 'video' }) => void;
  'participant:removed': (data: { participantId: string; reason: string }) => void;
  'meeting:ended': (data: { reason: string }) => void;
  'chat:message': (message: ChatMessage) => void;
  'screenShare:started': (data: { participantId: string; displayName: string }) => void;
  'screenShare:stopped': (data: { participantId: string }) => void;
  // Host receives this when a viewer wants to share
  'screenShare:requested': (data: ScreenShareRequest) => void;
  // Viewer receives approval or denial from host
  'screenShare:permissionGranted': () => void;
  'screenShare:permissionDenied': (data: { reason: string }) => void;
  'whiteboard:requested': (data: WhiteboardEditRequest) => void;
  'whiteboard:permissionGranted': () => void;
  'whiteboard:permissionDenied': (data: { reason: string }) => void;
  'whiteboard:toggle': (state: WhiteboardState) => void;
  'whiteboard:draw': (data: { line: DrawLinePayload; senderId: string }) => void;
  'whiteboard:strokeEnd': (data: { senderId: string }) => void;
  'whiteboard:undo': (data: { senderId: string }) => void;
  'whiteboard:redo': (data: { senderId: string }) => void;
  'whiteboard:clear': () => void;
  'whiteboard:scroll': (data: { scrollTop: number }) => void;
  'whiteboard:eraseRect': (data: { rect: EraseRectPayload }) => void;
  'webrtc:offer': (payload: WebRTCOfferPayload) => void;
  'webrtc:answer': (payload: WebRTCAnswerPayload) => void;
  'webrtc:ice-candidate': (payload: WebRTCIceCandidatePayload) => void;
  'error': (data: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'meeting:join': (
    data: {
      meetingCode: string;
      displayName: string;
      audioEnabled: boolean;
      videoEnabled: boolean;
    },
    callback: (response: { success: boolean; error?: string; data?: any }) => void
  ) => void;
  'meeting:leave': () => void;
  'meeting:end': (callback?: (res: { success: boolean; error?: string }) => void) => void;
  'participant:toggleMedia': (data: { audioEnabled?: boolean; videoEnabled?: boolean }) => void;
  'participant:mute': (data: { targetParticipantId: string; media?: 'audio' | 'video' }) => void;
  'participant:remove': (data: { targetParticipantId: string }) => void;
  // Viewer requests screen share permission from host
  'screenShare:request': () => void;
  // Host responds to a pending request
  'screenShare:requestResponse': (data: { requesterSocketId: string; approved: boolean }) => void;
  'screenShare:start': () => void;
  'screenShare:stop': () => void;
  'whiteboard:request': () => void;
  'whiteboard:requestResponse': (data: { requesterSocketId: string; approved: boolean }) => void;
  'whiteboard:toggle': (data: { isOpen: boolean }) => void;
  'whiteboard:draw': (data: { line: DrawLinePayload }) => void;
  'whiteboard:strokeEnd': () => void;
  'whiteboard:undo': () => void;
  'whiteboard:redo': () => void;
  'whiteboard:clear': () => void;
  'whiteboard:scroll': (data: { scrollTop: number }) => void;
  'whiteboard:eraseRect': (data: { rect: EraseRectPayload }) => void;
  'chat:send': (data: { message: string }) => void;
  'webrtc:offer': (payload: WebRTCOfferPayload) => void;
  'webrtc:answer': (payload: WebRTCAnswerPayload) => void;
  'webrtc:ice-candidate': (payload: WebRTCIceCandidatePayload) => void;
}

export interface MeetingHistoryItem {
  id: string;
  meetingCode: string;
  title: string;
  createdAt: string;
  endedAt?: string;
  durationMinutes: number;
  participantCount: number;
  isHost: boolean;
}