import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import { getDatabase } from '../db/index.js';
import { config } from '../config.js';
import { authService } from '../services/authService.js';
import type {
  Meeting,
  Participant,
  ChatMessage,
  WhiteboardState,
  DrawLinePayload,
  ServerToClientEvents,
  ClientToServerEvents,
  WebRTCOfferPayload,
  WebRTCAnswerPayload,
  WebRTCIceCandidatePayload,
  WhiteboardShape, WhiteboardText, WhiteboardAsset, WhiteboardSnapshot,
} from '@boom/types';

interface ActiveRoom {
  meeting: Meeting;
  participants: Map<string, Participant>; // socketId -> Participant
  hostSocketId?: string;
  screenSharerSocketId?: string;
  screenShareAllowedUsers: Set<string>;
  whiteboardEditors: Set<string>;
  whiteboardState: WhiteboardState;
  whiteboardHistory: DrawLinePayload[][];
  whiteboardRedo: DrawLinePayload[][];
  whiteboardUndoStack: WhiteboardSnapshot[];
  whiteboardRedoStack: WhiteboardSnapshot[];
  whiteboardObjectEditTimers: Map<string, ReturnType<typeof setTimeout>>;
  whiteboardCurrentStroke: Map<string, DrawLinePayload[]>;
  whiteboardAsset: import('@boom/types').WhiteboardAsset | null;
  whiteboardTexts: WhiteboardText[];
  whiteboardShapes: WhiteboardShape[];
}

export class RoomManager {
  private rooms: Map<string, ActiveRoom> = new Map(); // meetingCode -> ActiveRoom
  private socketToRoom: Map<string, string> = new Map(); // socketId -> meetingCode
  private db = getDatabase();

  constructor(private io: Server<ClientToServerEvents, ServerToClientEvents>) {}

  private captureWhiteboardSnapshot(room: ActiveRoom): WhiteboardSnapshot {
    return {
      history: room.whiteboardHistory.map(stroke => stroke.map(seg => ({ ...seg }))),
      asset: room.whiteboardAsset ? { ...room.whiteboardAsset } : null,
      texts: room.whiteboardTexts.map(text => ({ ...text })),
      shapes: room.whiteboardShapes.map(shape => ({ ...shape })),
    };
  }

  private restoreWhiteboardSnapshot(room: ActiveRoom, snapshot: WhiteboardSnapshot) {
    room.whiteboardHistory = snapshot.history.map(stroke => stroke.map(seg => ({ ...seg })));
    room.whiteboardAsset = snapshot.asset ? { ...snapshot.asset } : null;
    room.whiteboardTexts = snapshot.texts.map(text => ({ ...text }));
    room.whiteboardShapes = snapshot.shapes.map(shape => ({ ...shape }));
    room.whiteboardCurrentStroke.clear();
  }

  private clearObjectEditTimers(room: ActiveRoom) {
    for (const timer of room.whiteboardObjectEditTimers.values()) clearTimeout(timer);
    room.whiteboardObjectEditTimers.clear();
  }

  private recordWhiteboardAction(room: ActiveRoom) {
    this.clearObjectEditTimers(room);
    room.whiteboardUndoStack.push(this.captureWhiteboardSnapshot(room));
    // Keep memory bounded because an uploaded asset may contain a large data URL.
    if (room.whiteboardUndoStack.length > 30) room.whiteboardUndoStack.shift();
    room.whiteboardRedoStack = [];
    room.whiteboardRedo = [];
  }

  private emitWhiteboardSnapshot(meetingCode: string, room: ActiveRoom, event: 'whiteboard:undo'|'whiteboard:redo'|'whiteboard:snapshot' = 'whiteboard:snapshot') {
    this.io.to(meetingCode).emit(event, {
      history: room.whiteboardHistory,
      asset: room.whiteboardAsset,
      texts: room.whiteboardTexts,
      shapes: room.whiteboardShapes,
      canUndo: room.whiteboardUndoStack.length > 0,
      canRedo: room.whiteboardRedoStack.length > 0,
    });
    this.io.to(meetingCode).emit('whiteboard:historyState', {
      canUndo: room.whiteboardUndoStack.length > 0,
      canRedo: room.whiteboardRedoStack.length > 0,
    });
  }

  private recordObjectEdit(room: ActiveRoom, key: string) {
    if (room.whiteboardObjectEditTimers.has(key)) return;
    this.recordWhiteboardAction(room);
    const timer = setTimeout(() => { room.whiteboardObjectEditTimers.delete(key); }, 650);
    room.whiteboardObjectEditTimers.set(key, timer);
  }

  public registerSocket(socket: Socket<ClientToServerEvents, ServerToClientEvents>) {
    console.log(`[Socket Connected] ID: ${socket.id}`);

    // Join Meeting
    socket.on('meeting:join', async (data, callback) => {
      try {
        const { meetingCode, displayName, audioEnabled, videoEnabled } = data;
        const normalizedCode = meetingCode?.trim().toUpperCase();

        if (!normalizedCode) {
          return callback({ success: false, error: 'Meeting code is required.' });
        }

        // Check if meeting exists in DB
        const meeting = await this.db.getMeetingByCode(normalizedCode);
        if (!meeting) {
          return callback({ success: false, error: 'Meeting not found. Please check your link or code.' });
        }

        if (meeting.status === 'ENDED') {
          return callback({ success: false, error: 'This meeting has already ended.' });
        }

        // Retrieve or initialize ActiveRoom
        let room = this.rooms.get(normalizedCode);
        if (!room) {
          room = {
            meeting,
            participants: new Map(),
            whiteboardState: { isOpen: false },
            screenShareAllowedUsers: new Set(),
            whiteboardEditors: new Set(),
            whiteboardHistory: [],
            whiteboardRedo: [],
            whiteboardUndoStack: [],
            whiteboardRedoStack: [],
            whiteboardObjectEditTimers: new Map(),
            whiteboardCurrentStroke: new Map(),
            whiteboardAsset: null,
            whiteboardTexts: [],
            whiteboardShapes: [],
          };
          this.rooms.set(normalizedCode, room);
        }

        // Check participant limit
        if (room.participants.size >= config.maxParticipantsPerMeeting) {
          return callback({
            success: false,
            error: `This meeting has reached the maximum capacity of ${config.maxParticipantsPerMeeting} participants.`,
          });
        }

        // Authenticate user if token provided in socket handshake
        const token = socket.handshake.auth?.token;
        let authUser = null;
        if (token) {
          authUser = await authService.verifyToken(token);
        }

        // HOST RULE: the first participant to join the live room is the host.
        // The invite link never grants host privileges, and authenticated users
        // joining later must remain guests. This is deliberately based on the
        // live room's first participant, not on credentials supplied by a
        // shareable meeting link.
        const isHost = room.participants.size === 0;
        if (isHost) {
          room.hostSocketId = socket.id;
        }

        const participant: Participant = {
          id: socket.id,
          userId: authUser?.id || null,
          meetingId: meeting.id,
          displayName: displayName?.trim() || (authUser?.name ?? (isHost ? 'Host' : 'Guest')),
          isHost,
          audioEnabled: audioEnabled !== false,
          videoEnabled: videoEnabled !== false,
          screenShareActive: false,
          joinedAt: new Date().toISOString(),
        };

        // Add to room
        room.participants.set(socket.id, participant);
        this.socketToRoom.set(socket.id, normalizedCode);

        // Join socket.io room
        socket.join(normalizedCode);

        // Save participant to DB
        await this.db.addParticipant({
          id: socket.id,
          meetingId: meeting.id,
          userId: participant.userId,
          displayName: participant.displayName,
          isHost: participant.id === room.hostSocketId,
        });

        // Fetch recent messages
        const messages = await this.db.getMeetingMessages(meeting.id);

        // Send room state to the joining participant
        const allParticipants = Array.from(room.participants.values());
        socket.emit('room:joined', {
          meeting: room.meeting,
          participant,
          participants: allParticipants,
          messages,
          whiteboardState: room.whiteboardState,
          whiteboardHistory: room.whiteboardHistory,
          whiteboardAsset: room.whiteboardAsset,
          whiteboardTexts: room.whiteboardTexts,
          whiteboardShapes: room.whiteboardShapes,
          canUndo: room.whiteboardUndoStack.length > 0,
          canRedo: room.whiteboardRedoStack.length > 0,
        });

        // If screen share is active, notify the newly joined participant
        if (room.screenSharerSocketId) {
          const sharer = room.participants.get(room.screenSharerSocketId);
          if (sharer) {
            socket.emit('screenShare:started', {
              participantId: room.screenSharerSocketId,
              displayName: sharer.displayName,
            });
          }
        }

        // Broadcast to all other participants in the room
        socket.to(normalizedCode).emit('participant:joined', participant);

        console.log(`[Meeting Join] User "${participant.displayName}" (${socket.id}) joined "${normalizedCode}" (Total: ${room.participants.size})`);

        callback({ success: true, data: { participant, meeting } });
      } catch (err: any) {
        console.error('[Meeting Join Error]', err);
        callback({ success: false, error: err.message || 'Failed to join meeting' });
      }
    });

    // Toggle Audio / Video Media State
    socket.on('participant:toggleMedia', (data) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      if (!participant) return;

      if (typeof data.audioEnabled === 'boolean') {
        participant.audioEnabled = data.audioEnabled;
      }
      if (typeof data.videoEnabled === 'boolean') {
        participant.videoEnabled = data.videoEnabled;
      }

      this.io.to(meetingCode).emit('participant:updated', participant);
    });

    // Host Action: Disable a participant's microphone or camera.
    socket.on('participant:mute', ({ targetParticipantId, media = 'audio' }) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      const requester = room.participants.get(socket.id);
      if (!requester || room.hostSocketId !== socket.id) {
        return socket.emit('error', {
          code: 'FORBIDDEN',
          message: 'Only the host can disable participant media.',
        });
      }

      const target = room.participants.get(targetParticipantId);
      if (!target || target.id === room.hostSocketId) return;

      if (media === 'video') {
        target.videoEnabled = false;
      } else {
        target.audioEnabled = false;
      }

      this.io.to(meetingCode).emit('participant:updated', target);
      this.io.to(targetParticipantId).emit('participant:muted', {
        participantId: targetParticipantId,
        mutedByHost: true,
        media,
      });
    });

    // Host Action: Remove Participant
    socket.on('participant:remove', ({ targetParticipantId }) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      const requester = room.participants.get(socket.id);
      if (!requester || room.hostSocketId !== socket.id) {
        return socket.emit('error', { code: 'FORBIDDEN', message: 'Only the host can remove participants.' });
      }

      const target = room.participants.get(targetParticipantId);
      if (target) {
        // Send removed notice to target
        this.io.to(targetParticipantId).emit('participant:removed', {
          participantId: targetParticipantId,
          reason: 'You have been removed from this meeting by the host.',
        });

        // Disconnect target from room
        const targetSocket = this.io.sockets.sockets.get(targetParticipantId);
        if (targetSocket) {
          targetSocket.leave(meetingCode);
        }

        room.participants.delete(targetParticipantId);
        this.socketToRoom.delete(targetParticipantId);
        this.db.markParticipantLeft(targetParticipantId);

        this.io.to(meetingCode).emit('participant:left', {
          participantId: targetParticipantId,
          displayName: target.displayName,
        });
      }
    });

    // Host Action: End Meeting for Everyone
    socket.on('meeting:end', async (callback) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return callback?.({ success: false, error: 'Not in a meeting' });

      const room = this.rooms.get(meetingCode);
      if (!room) return callback?.({ success: false, error: 'Room not found' });

      const requester = room.participants.get(socket.id);
      if (!requester || room.hostSocketId !== socket.id) {
        return callback?.({ success: false, error: 'Only the host can end the meeting for everyone.' });
      }

      // Personal rooms keep their permanent link. Ending a personal room
      // only ends the current live session; the same link can be reused later.
      if (!room.meeting.isPersistent) {
        await this.db.endMeeting(room.meeting.id);
      }

      // Notify all participants
      this.io.to(meetingCode).emit('meeting:ended', {
        reason: 'The host has ended this meeting for everyone.',
      });

      // Clear room memory
      for (const [pSocketId] of room.participants) {
        this.socketToRoom.delete(pSocketId);
        this.db.markParticipantLeft(pSocketId);
      }
      this.rooms.delete(meetingCode);

      callback?.({ success: true });
    });

    // Screen Share Permission: Viewer requests permission from host
    socket.on('screenShare:request', () => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      const requester = room.participants.get(socket.id);
      if (!requester) return;

      const hostSocketId = room.hostSocketId;
      if (!hostSocketId) {
        socket.emit('screenShare:permissionDenied', { reason: 'The host is not available.' });
        return;
      }

      this.io.to(hostSocketId).emit('screenShare:requested', {
        requesterSocketId: socket.id,
        requesterName: requester.displayName,
      });
    });

    // Host responds to a permission request
    socket.on('screenShare:requestResponse', ({ requesterSocketId, approved }) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      const responder = room.participants.get(socket.id);
      const isHost = responder?.id === room.hostSocketId;
      if (!isHost) return;

      const requester = room.participants.get(requesterSocketId);
      if (!requester || requester.id === room.hostSocketId) return;

      if (approved) {
        room.screenShareAllowedUsers.add(requesterSocketId);
        this.io.to(requesterSocketId).emit('screenShare:permissionGranted');
      } else {
        room.screenShareAllowedUsers.delete(requesterSocketId);
        this.io.to(requesterSocketId).emit('screenShare:permissionDenied', {
          reason: 'The host has declined your screen share request.',
        });
      }
    });

    // Screen Share Start / Stop
    socket.on('screenShare:start', () => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      if (!participant) return;

      const isHost = participant.id === room.hostSocketId;
      const hasScreenSharePermission = isHost || room.screenShareAllowedUsers.has(socket.id);
      if (!hasScreenSharePermission) {
        return socket.emit('screenShare:permissionDenied', {
          reason: 'The host has not granted you permission to share your screen.',
        });
      }

      // If another user was sharing, stop previous
      if (room.screenSharerSocketId && room.screenSharerSocketId !== socket.id) {
        const prev = room.participants.get(room.screenSharerSocketId);
        if (prev) {
          prev.screenShareActive = false;
          this.io.to(meetingCode).emit('screenShare:stopped', { participantId: room.screenSharerSocketId });
        }
      }

      room.screenSharerSocketId = socket.id;
      participant.screenShareActive = true;

      this.io.to(meetingCode).emit('participant:updated', participant);
      this.io.to(meetingCode).emit('screenShare:started', {
        participantId: socket.id,
        displayName: participant.displayName,
      });
    });

    socket.on('screenShare:stop', () => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      if (participant) {
        participant.screenShareActive = false;
        this.io.to(meetingCode).emit('participant:updated', participant);
      }

      if (room.screenSharerSocketId === socket.id) {
        room.screenSharerSocketId = undefined;
        this.io.to(meetingCode).emit('screenShare:stopped', { participantId: socket.id });
      }
    });

    socket.on('screenShare:revoke', ({ targetParticipantId }) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;
      const room = this.rooms.get(meetingCode);
      const host = room?.participants.get(socket.id);
      if (!room || !host || room.hostSocketId !== socket.id) return;
      const target = room.participants.get(targetParticipantId);
      if (!target || target.id === room.hostSocketId) return;
      room.screenShareAllowedUsers.delete(targetParticipantId);
      if (room.screenSharerSocketId === targetParticipantId) {
        room.screenSharerSocketId = undefined;
        if (target) { target.screenShareActive = false; this.io.to(meetingCode).emit('participant:updated', target); }
        this.io.to(meetingCode).emit('screenShare:stopped', { participantId: targetParticipantId });
        this.io.to(targetParticipantId).emit('screenShare:forceStop', { reason: 'The host stopped your screen sharing.' });
      }
      this.io.to(targetParticipantId).emit('screenShare:permissionRevoked', { reason: 'The host removed your screen-sharing permission.' });
    });

    // Whiteboard Permission: viewer requests editing access from host
    socket.on('whiteboard:request', () => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      const requester = room.participants.get(socket.id);
      if (!requester) return;

      const isHost = requester.id === room.hostSocketId;
      if (isHost) {
        socket.emit('whiteboard:permissionGranted');
        return;
      }

      const hostSocketId = room.hostSocketId;
      if (!hostSocketId) {
        socket.emit('whiteboard:permissionDenied', { reason: 'The host is not available.' });
        return;
      }

      if (room.whiteboardEditors.has(socket.id)) {
        socket.emit('whiteboard:permissionGranted');
        return;
      }

      this.io.to(hostSocketId).emit('whiteboard:requested', {
        requesterSocketId: socket.id,
        requesterName: requester.displayName,
      });
    });

    socket.on('whiteboard:revoke', ({ targetParticipantId }) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;
      const room = this.rooms.get(meetingCode);
      const host = room?.participants.get(socket.id);
      if (!room || !host || room.hostSocketId !== socket.id) return;
      const target = room.participants.get(targetParticipantId);
      if (!target || target.id === room.hostSocketId) return;
      room.whiteboardEditors.delete(targetParticipantId);
      this.io.to(targetParticipantId).emit('whiteboard:permissionRevoked', { reason: 'The host removed your whiteboard editing permission.' });
    });

    // Host responds to a whiteboard editing request
    socket.on('whiteboard:requestResponse', ({ requesterSocketId, approved }) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      const responder = room.participants.get(socket.id);
      const isHost = responder?.id === room.hostSocketId;
      if (!isHost) return;

      const requester = room.participants.get(requesterSocketId);
      if (!requester || requester.id === room.hostSocketId) return;

      if (approved) {
        room.whiteboardEditors.add(requesterSocketId);
        this.io.to(requesterSocketId).emit('whiteboard:permissionGranted');
      } else {
        room.whiteboardEditors.delete(requesterSocketId);
        this.io.to(requesterSocketId).emit('whiteboard:permissionDenied', {
          reason: 'The host has declined your whiteboard editing request.',
        });
      }
    });

    // Whiteboard Actions — server-authoritative history for consistent undo/redo and late joins.
    socket.on('whiteboard:toggle', ({ isOpen }) => {
      const meetingCode = this.socketToRoom.get(socket.id); if (!meetingCode) return;
      const room = this.rooms.get(meetingCode); if (!room) return;
      const p = room.participants.get(socket.id);
      if (!p || room.hostSocketId !== socket.id) return;
      room.whiteboardState = { isOpen, activePresenterId: isOpen ? socket.id : undefined, activePresenterName: isOpen ? p.displayName : undefined };
      this.io.to(meetingCode).emit('whiteboard:toggle', room.whiteboardState);
      this.emitWhiteboardSnapshot(meetingCode, room);
    });

    socket.on('whiteboard:draw', ({ line }) => {
      const meetingCode = this.socketToRoom.get(socket.id); if (!meetingCode) return;
      const room = this.rooms.get(meetingCode); if (!room) return;
      const p = room.participants.get(socket.id);
      const canEdit = !!p && (socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id));
      if (!canEdit) return;
      let buf = room.whiteboardCurrentStroke.get(socket.id);
      if (!buf) {
        this.recordWhiteboardAction(room);
        buf = [];
      }
      buf.push(line); room.whiteboardCurrentStroke.set(socket.id, buf);
      socket.to(meetingCode).emit('whiteboard:draw', { line, senderId: socket.id });
    });

    socket.on('whiteboard:strokeEnd', () => {
      const meetingCode = this.socketToRoom.get(socket.id); if (!meetingCode) return;
      const room = this.rooms.get(meetingCode); if (!room) return;
      const p = room.participants.get(socket.id);
      const canEdit = !!p && (socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id));
      if (!canEdit) return;
      const stroke = room.whiteboardCurrentStroke.get(socket.id) || [];
      if (stroke.length) room.whiteboardHistory.push(stroke);
      room.whiteboardCurrentStroke.delete(socket.id);
      socket.to(meetingCode).emit('whiteboard:strokeEnd', { senderId: socket.id });
      this.io.to(meetingCode).emit('whiteboard:historyState', { canUndo: room.whiteboardUndoStack.length > 0, canRedo: room.whiteboardRedoStack.length > 0 });
    });

    socket.on('whiteboard:undo', () => {
      const meetingCode = this.socketToRoom.get(socket.id); if (!meetingCode) return; const room = this.rooms.get(meetingCode); if (!room) return;
      const p = room.participants.get(socket.id); if (!p || !(socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id)) || !room.whiteboardUndoStack.length) return;
      room.whiteboardRedoStack.push(this.captureWhiteboardSnapshot(room));
      const previous = room.whiteboardUndoStack.pop(); if (!previous) return;
      this.restoreWhiteboardSnapshot(room, previous);
      this.emitWhiteboardSnapshot(meetingCode, room, 'whiteboard:undo');
    });

    socket.on('whiteboard:redo', () => {
      const meetingCode = this.socketToRoom.get(socket.id); if (!meetingCode) return; const room = this.rooms.get(meetingCode); if (!room) return;
      const p = room.participants.get(socket.id); if (!p || !(socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id)) || !room.whiteboardRedoStack.length) return;
      room.whiteboardUndoStack.push(this.captureWhiteboardSnapshot(room));
      const next = room.whiteboardRedoStack.pop(); if (!next) return;
      this.restoreWhiteboardSnapshot(room, next);
      this.emitWhiteboardSnapshot(meetingCode, room, 'whiteboard:redo');
    });

    socket.on('whiteboard:clear', () => {
      const meetingCode = this.socketToRoom.get(socket.id); if (!meetingCode) return; const room = this.rooms.get(meetingCode); if (!room) return;
      const p = room.participants.get(socket.id); if (!p || !(socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id))) return;
      this.recordWhiteboardAction(room);
      room.whiteboardHistory=[]; room.whiteboardRedo=[]; room.whiteboardCurrentStroke.clear(); room.whiteboardTexts=[]; room.whiteboardShapes=[]; room.whiteboardAsset=null;
      this.emitWhiteboardSnapshot(meetingCode, room);
    });

    socket.on('whiteboard:textUpdate', ({ text }) => {
      const meetingCode=this.socketToRoom.get(socket.id); if(!meetingCode) return; const room=this.rooms.get(meetingCode); if(!room) return; const p=room.participants.get(socket.id);
      if(!p || !(socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id))) return;
      this.recordObjectEdit(room, `text:${text.id}`);
      room.whiteboardTexts = room.whiteboardTexts.map(x=>x.id===text.id ? { ...x, ...text } : x);
      this.io.to(meetingCode).emit('whiteboard:textUpdate',{text});
      this.io.to(meetingCode).emit('whiteboard:historyState',{canUndo:room.whiteboardUndoStack.length>0,canRedo:room.whiteboardRedoStack.length>0});
    });

    socket.on('whiteboard:textDelete', ({ textId }) => {
      const meetingCode=this.socketToRoom.get(socket.id); if(!meetingCode) return; const room=this.rooms.get(meetingCode); if(!room) return; const p=room.participants.get(socket.id);
      if(!p || !(socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id))) return;
      if(!room.whiteboardTexts.some(x=>x.id===textId)) return;
      this.recordWhiteboardAction(room);
      room.whiteboardTexts = room.whiteboardTexts.filter(x=>x.id!==textId);
      this.io.to(meetingCode).emit('whiteboard:textDelete',{textId});
      this.io.to(meetingCode).emit('whiteboard:historyState',{canUndo:room.whiteboardUndoStack.length>0,canRedo:room.whiteboardRedoStack.length>0});
    });

    socket.on('whiteboard:shape', ({ shape }) => {
      const meetingCode=this.socketToRoom.get(socket.id); if(!meetingCode) return; const room=this.rooms.get(meetingCode); if(!room) return; const p=room.participants.get(socket.id);
      if(!p || !(socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id))) return;
      const safe: WhiteboardShape = { ...shape, id: shape.id || `shape-${crypto.randomUUID()}`, rotation: Number(shape.rotation || 0) };
      this.recordWhiteboardAction(room);
      room.whiteboardShapes = [...room.whiteboardShapes.filter(x=>x.id!==safe.id), safe];
      this.io.to(meetingCode).emit('whiteboard:shape',{shape:safe});
    });

    socket.on('whiteboard:shapeUpdate', ({ shape }) => {
      const meetingCode=this.socketToRoom.get(socket.id); if(!meetingCode) return; const room=this.rooms.get(meetingCode); if(!room) return; const p=room.participants.get(socket.id);
      if(!p || !(socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id))) return;
      this.recordObjectEdit(room, `shape:${shape.id}`);
      room.whiteboardShapes = room.whiteboardShapes.map(x=>x.id===shape.id ? { ...x, ...shape } : x);
      this.io.to(meetingCode).emit('whiteboard:shapeUpdate',{shape});
      this.io.to(meetingCode).emit('whiteboard:historyState',{canUndo:room.whiteboardUndoStack.length>0,canRedo:room.whiteboardRedoStack.length>0});
    });

    socket.on('whiteboard:shapeDelete', ({ shapeId }) => {
      const meetingCode=this.socketToRoom.get(socket.id); if(!meetingCode) return; const room=this.rooms.get(meetingCode); if(!room) return; const p=room.participants.get(socket.id);
      if(!p || !(socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id))) return;
      if(!room.whiteboardShapes.some(x=>x.id===shapeId)) return;
      this.recordWhiteboardAction(room);
      room.whiteboardShapes = room.whiteboardShapes.filter(x=>x.id!==shapeId);
      this.io.to(meetingCode).emit('whiteboard:shapeDelete',{shapeId});
      this.io.to(meetingCode).emit('whiteboard:historyState',{canUndo:room.whiteboardUndoStack.length>0,canRedo:room.whiteboardRedoStack.length>0});
    });

    socket.on('whiteboard:scroll', ({ scrollTop }) => {
      const meetingCode=this.socketToRoom.get(socket.id); if(!meetingCode) return; const room=this.rooms.get(meetingCode); if(!room) return; const p=room.participants.get(socket.id);
      if(!p || !(socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id))) return;
      socket.to(meetingCode).emit('whiteboard:scroll',{scrollTop});
    });

    socket.on('whiteboard:eraseRect', ({ rect }) => {
      const meetingCode=this.socketToRoom.get(socket.id); if(!meetingCode) return; const room=this.rooms.get(meetingCode); if(!room) return; const p=room.participants.get(socket.id);
      if(!p || !(socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id))) return;
      const inRect=(x:number,y:number)=>x>=Math.min(rect.x1,rect.x2)&&x<=Math.max(rect.x1,rect.x2)&&y>=Math.min(rect.y1,rect.y2)&&y<=Math.max(rect.y1,rect.y2);
      this.recordWhiteboardAction(room);
      room.whiteboardHistory=room.whiteboardHistory.map(stroke=>stroke.filter(seg=>!inRect((seg.prevX+seg.currX)/2,(seg.prevY+seg.currY)/2))).filter(Boolean);
      room.whiteboardTexts = room.whiteboardTexts.filter(text => !inRect(text.x, text.y));
      this.emitWhiteboardSnapshot(meetingCode, room);
    });

    socket.on('whiteboard:cursor', ({ x, y, visible }) => {
      const meetingCode=this.socketToRoom.get(socket.id); if(!meetingCode) return; const room=this.rooms.get(meetingCode); if(!room) return; const p=room.participants.get(socket.id); if(!p) return;
      socket.to(meetingCode).emit('whiteboard:cursor',{participantId:socket.id,displayName:p.displayName,x,y,visible});
    });

    socket.on('whiteboard:text', ({ text }) => {
      const meetingCode=this.socketToRoom.get(socket.id); if(!meetingCode) return; const room=this.rooms.get(meetingCode); if(!room) return; const p=room.participants.get(socket.id);
      if(!p || !(socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id))) return;
      this.recordWhiteboardAction(room);
      room.whiteboardTexts = [...room.whiteboardTexts.filter(x=>x.id!==text.id), text];
      this.io.to(meetingCode).emit('whiteboard:text',{text});
      this.io.to(meetingCode).emit('whiteboard:historyState',{canUndo:room.whiteboardUndoStack.length>0,canRedo:room.whiteboardRedoStack.length>0});
    });

    socket.on('whiteboard:asset', ({ asset }) => {
      const meetingCode=this.socketToRoom.get(socket.id); if(!meetingCode) return; const room=this.rooms.get(meetingCode); if(!room) return; const p=room.participants.get(socket.id);
      if(!p || !(socket.id === room.hostSocketId || room.whiteboardEditors.has(socket.id))) return;
      this.recordWhiteboardAction(room);
      room.whiteboardAsset=asset; this.io.to(meetingCode).emit('whiteboard:asset',{asset});
      this.io.to(meetingCode).emit('whiteboard:historyState',{canUndo:room.whiteboardUndoStack.length>0,canRedo:room.whiteboardRedoStack.length>0});
    });

    // Chat Message
    socket.on('chat:send', async ({ message }) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      if (!participant) return;

      const trimmed = message?.trim();
      if (!trimmed || trimmed.length > 2000) return;

      const chatMsg: ChatMessage = {
        id: `msg_${crypto.randomUUID()}`,
        meetingId: room.meeting.id,
        senderId: socket.id,
        senderName: participant.displayName,
        isHost: participant.id === room.hostSocketId,
        message: trimmed,
        createdAt: new Date().toISOString(),
      };

      await this.db.saveMessage(chatMsg);
      this.io.to(meetingCode).emit('chat:message', chatMsg);
    });

    // WebRTC Signaling Relay
    socket.on('webrtc:offer', (payload: WebRTCOfferPayload) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      // Forward offer directly to target socket ID
      this.io.to(payload.targetSocketId).emit('webrtc:offer', {
        ...payload,
        callerSocketId: socket.id,
      });
    });

    socket.on('webrtc:answer', (payload: WebRTCAnswerPayload) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      // Forward answer directly to target socket ID
      this.io.to(payload.targetSocketId).emit('webrtc:answer', {
        ...payload,
        responderSocketId: socket.id,
      });
    });

    socket.on('webrtc:ice-candidate', (payload: WebRTCIceCandidatePayload) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      // Forward ICE candidate to target
      this.io.to(payload.targetSocketId).emit('webrtc:ice-candidate', {
        targetSocketId: payload.targetSocketId,
        senderSocketId: socket.id,
        candidate: payload.candidate,
      });
    });

    // Normal Participant Leave (Does NOT end meeting for others)
    const handleLeave = () => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (room) {
        const participant = room.participants.get(socket.id);
        const displayName = participant?.displayName || 'Participant';

        // Stop screen share if leaving user was sharing
        if (room.screenSharerSocketId === socket.id) {
          room.screenSharerSocketId = undefined;
          this.io.to(meetingCode).emit('screenShare:stopped', { participantId: socket.id });
        }

        // Close whiteboard if presenter left
        if (room.whiteboardState.activePresenterId === socket.id) {
          room.whiteboardState = { isOpen: false };
          this.io.to(meetingCode).emit('whiteboard:toggle', room.whiteboardState);
        }

        if (room.hostSocketId === socket.id) {
          room.hostSocketId = undefined;
        }

        room.participants.delete(socket.id);
        room.screenShareAllowedUsers.delete(socket.id);
        room.whiteboardEditors.delete(socket.id);
        this.db.markParticipantLeft(socket.id);

        this.io.to(meetingCode).emit('participant:left', {
          participantId: socket.id,
          displayName,
        });

        console.log(`[Meeting Leave] User "${displayName}" (${socket.id}) left "${meetingCode}" (Remaining: ${room.participants.size})`);

        // If all participants left, clear memory
        if (room.participants.size === 0) {
          for (const timer of room.whiteboardObjectEditTimers.values()) clearTimeout(timer);
          room.whiteboardObjectEditTimers.clear();
          this.rooms.delete(meetingCode);
        }
      }

      this.socketToRoom.delete(socket.id);
      socket.leave(meetingCode);
    };

    socket.on('meeting:leave', handleLeave);
    socket.on('disconnect', handleLeave);
  }
}