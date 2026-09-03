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
} from '@boom/types';

interface ActiveRoom {
  meeting: Meeting;
  participants: Map<string, Participant>; // socketId -> Participant
  hostUserId: string;
  hostSocketId?: string;
  screenSharerSocketId?: string;
  whiteboardState: WhiteboardState;
}

export class RoomManager {
  private rooms: Map<string, ActiveRoom> = new Map(); // meetingCode -> ActiveRoom
  private socketToRoom: Map<string, string> = new Map(); // socketId -> meetingCode
  private db = getDatabase();

  constructor(private io: Server<ClientToServerEvents, ServerToClientEvents>) {}

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
            hostUserId: meeting.hostId,
            whiteboardState: { isOpen: false },
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

        const isHost = authUser ? authUser.id === meeting.hostId : (room.participants.size === 0 && !room.hostSocketId);
        if (isHost && !room.hostSocketId) {
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
          isHost: participant.isHost,
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

    // Host Action: Mute Participant
    socket.on('participant:mute', ({ targetParticipantId }) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      const requester = room.participants.get(socket.id);
      if (!requester || !requester.isHost) {
        return socket.emit('error', { code: 'FORBIDDEN', message: 'Only the host can mute participants.' });
      }

      const target = room.participants.get(targetParticipantId);
      if (target) {
        target.audioEnabled = false;
        this.io.to(meetingCode).emit('participant:updated', target);
        this.io.to(targetParticipantId).emit('participant:muted', {
          participantId: targetParticipantId,
          mutedByHost: true,
        });
      }
    });

    // Host Action: Remove Participant
    socket.on('participant:remove', ({ targetParticipantId }) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      const requester = room.participants.get(socket.id);
      if (!requester || !requester.isHost) {
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
      if (!requester || !requester.isHost) {
        return callback?.({ success: false, error: 'Only the host can end the meeting for everyone.' });
      }

      // Mark meeting ended in database
      await this.db.endMeeting(room.meeting.id);

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
      const isHost = responder?.isHost || room.hostSocketId === socket.id;
      if (!isHost) return;

      if (approved) {
        this.io.to(requesterSocketId).emit('screenShare:permissionGranted');
      } else {
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

    // Whiteboard Actions
    socket.on('whiteboard:toggle', ({ isOpen }) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      if (!participant) return;

      room.whiteboardState = {
        isOpen,
        activePresenterId: isOpen ? socket.id : undefined,
        activePresenterName: isOpen ? participant.displayName : undefined,
      };

      this.io.to(meetingCode).emit('whiteboard:toggle', room.whiteboardState);
    });

    socket.on('whiteboard:draw', ({ line }) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      // Broadcast draw event to everyone else in the room
      socket.to(meetingCode).emit('whiteboard:draw', {
        line,
        senderId: socket.id,
      });
    });

    socket.on('whiteboard:strokeEnd', () => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      // Tell everyone else this sender's in-progress stroke is complete,
      // so their local undo history stays in sync with the sender's.
      socket.to(meetingCode).emit('whiteboard:strokeEnd', { senderId: socket.id });
    });

    socket.on('whiteboard:undo', () => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      // Broadcast undo to all other participants so they remove the same stroke
      socket.to(meetingCode).emit('whiteboard:undo', { senderId: socket.id });
    });

    socket.on('whiteboard:clear', () => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      // Broadcast clear to all other participants (not back to sender)
      socket.to(meetingCode).emit('whiteboard:clear');
    });

    socket.on('whiteboard:scroll', ({ scrollTop }) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      const room = this.rooms.get(meetingCode);
      if (!room) return;

      // Only the host's scroll position drives everyone else's view,
      // so viewers stay on par with what the host is writing lower down.
      const sender = room.participants.get(socket.id);
      const isHost = sender?.isHost || room.hostSocketId === socket.id;
      if (!isHost) return;

      socket.to(meetingCode).emit('whiteboard:scroll', { scrollTop });
    });

    socket.on('whiteboard:eraseRect', ({ rect }) => {
      const meetingCode = this.socketToRoom.get(socket.id);
      if (!meetingCode) return;

      // Broadcast the erased rectangle so every peer removes the same content
      socket.to(meetingCode).emit('whiteboard:eraseRect', { rect });
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
        isHost: participant.isHost,
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
        this.db.markParticipantLeft(socket.id);

        this.io.to(meetingCode).emit('participant:left', {
          participantId: socket.id,
          displayName,
        });

        console.log(`[Meeting Leave] User "${displayName}" (${socket.id}) left "${meetingCode}" (Remaining: ${room.participants.size})`);

        // If all participants left, clear memory
        if (room.participants.size === 0) {
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