import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { rtcConfiguration } from '../utils/webrtcConfig';
import type {
  Meeting,
  Participant,
  ChatMessage,
  WhiteboardState,
  DrawLinePayload,
  EraseRectPayload,
  WhiteboardAsset,
  WhiteboardCursor,
  WhiteboardText, WhiteboardShape,
  ScreenShareRequest,
  WhiteboardEditRequest,
  ClientMeetingState,
  ConnectionQuality,
  ServerToClientEvents,
  ClientToServerEvents,
} from '@boom/types';

interface UseWebRTCProps {
  meetingCode: string;
  displayName: string;
  localStream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenStream: MediaStream | null;
  isSharingScreen: boolean;
  onKicked?: (reason: string) => void;
  onMeetingEnded?: (reason: string) => void;
  onHostMediaDisabled?: (media: 'audio' | 'video') => void;
  onWhiteboardDraw?: (line: DrawLinePayload, senderId: string) => void;
  onWhiteboardStrokeEnd?: (senderId: string) => void;
  onWhiteboardUndo?: () => void;
  onWhiteboardRedo?: () => void;
  onWhiteboardClear?: () => void;
  onWhiteboardScroll?: (scrollTop: number) => void;
  onWhiteboardEraseRect?: (rect: EraseRectPayload) => void;
  onWhiteboardSnapshot?: (history: DrawLinePayload[][], asset: WhiteboardAsset | null, texts: WhiteboardText[], shapes?: WhiteboardShape[]) => void;
  onWhiteboardCursor?: (cursor: WhiteboardCursor) => void;
  onWhiteboardText?: (text: WhiteboardText) => void;
  onWhiteboardAsset?: (asset: WhiteboardAsset | null) => void;
  onWhiteboardShape?: (shape: WhiteboardShape) => void;
  onWhiteboardTextUpdate?: (text: WhiteboardText) => void;
  onWhiteboardTextDelete?: (textId: string) => void;
  onWhiteboardShapeDelete?: (shapeId: string) => void;
  onWhiteboardHistoryState?: (state: { canUndo: boolean; canRedo: boolean }) => void;
  onScreenShareForceStop?: (reason: string) => void;
}

// In local dev Vite on port 3000 connects directly to backend port 5000 to prevent Vite proxy ECONNRESET
const SOCKET_SERVER_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && window.location.port === '3000'
    ? 'http://localhost:5000'
    : '/');

export function useWebRTC({
  meetingCode,
  displayName,
  localStream,
  audioEnabled,
  videoEnabled,
  screenStream,
  isSharingScreen,
  onKicked,
  onMeetingEnded,
  onHostMediaDisabled,
  onWhiteboardDraw,
  onWhiteboardStrokeEnd,
  onWhiteboardUndo,
  onWhiteboardRedo,
  onWhiteboardClear,
  onWhiteboardScroll,
  onWhiteboardEraseRect,
  onWhiteboardSnapshot,
  onWhiteboardCursor,
  onWhiteboardText,
  onWhiteboardAsset,
  onWhiteboardShape,
  onWhiteboardTextUpdate,
  onWhiteboardTextDelete,
  onWhiteboardShapeDelete,
  onWhiteboardHistoryState,
  onScreenShareForceStop,
}: UseWebRTCProps) {
  const [meetingState, setMeetingState] = useState<ClientMeetingState>('CONNECTING');
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [localParticipant, setLocalParticipant] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [screenSharer, setScreenSharer] = useState<{ id: string; name: string } | null>(null);
  const [whiteboardState, setWhiteboardState] = useState<WhiteboardState>({ isOpen: false });
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('EXCELLENT');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Screen share permission states
  const [pendingScreenShareRequest, setPendingScreenShareRequest] = useState<ScreenShareRequest | null>(null);
  const [screenSharePermission, setScreenSharePermission] = useState<'idle' | 'pending' | 'granted' | 'denied'>('idle');
  const [pendingWhiteboardRequest, setPendingWhiteboardRequest] = useState<WhiteboardEditRequest | null>(null);
  const [whiteboardPermission, setWhiteboardPermission] = useState<'idle' | 'pending' | 'granted' | 'denied'>('idle');

  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());

  // Keep fresh references to volatile values without triggering socket reconnections
  const localStreamRef = useRef<MediaStream | null>(localStream);
  const screenStreamRef = useRef<MediaStream | null>(screenStream);
  const isSharingScreenRef = useRef<boolean>(isSharingScreen);
  const displayNameRef = useRef<string>(displayName);
  const audioEnabledRef = useRef<boolean>(audioEnabled);
  const videoEnabledRef = useRef<boolean>(videoEnabled);
  const onKickedRef = useRef(onKicked);
  const onMeetingEndedRef = useRef(onMeetingEnded);
  const onHostMediaDisabledRef = useRef(onHostMediaDisabled);
  const onWhiteboardDrawRef = useRef(onWhiteboardDraw);
  const onWhiteboardStrokeEndRef = useRef(onWhiteboardStrokeEnd);
  const onWhiteboardUndoRef = useRef(onWhiteboardUndo);
  const onWhiteboardRedoRef = useRef(onWhiteboardRedo);
  const onWhiteboardClearRef = useRef(onWhiteboardClear);
  const onWhiteboardScrollRef = useRef(onWhiteboardScroll);
  const onWhiteboardEraseRectRef = useRef(onWhiteboardEraseRect);
  const onWhiteboardSnapshotRef = useRef(onWhiteboardSnapshot);
  const onWhiteboardCursorRef = useRef(onWhiteboardCursor);
  const onWhiteboardTextRef = useRef(onWhiteboardText);
  const onWhiteboardAssetRef = useRef(onWhiteboardAsset);
  const onWhiteboardShapeRef = useRef(onWhiteboardShape);
  const onWhiteboardTextUpdateRef = useRef(onWhiteboardTextUpdate);
  const onWhiteboardTextDeleteRef = useRef(onWhiteboardTextDelete);
  const onWhiteboardShapeDeleteRef = useRef(onWhiteboardShapeDelete);
  const onWhiteboardHistoryStateRef = useRef(onWhiteboardHistoryState);
  const onScreenShareForceStopRef = useRef(onScreenShareForceStop);

  localStreamRef.current = localStream;
  screenStreamRef.current = screenStream;
  isSharingScreenRef.current = isSharingScreen;
  displayNameRef.current = displayName;
  audioEnabledRef.current = audioEnabled;
  videoEnabledRef.current = videoEnabled;
  onKickedRef.current = onKicked;
  onMeetingEndedRef.current = onMeetingEnded;
  onHostMediaDisabledRef.current = onHostMediaDisabled;
  onWhiteboardDrawRef.current = onWhiteboardDraw;
  onWhiteboardStrokeEndRef.current = onWhiteboardStrokeEnd;
  onWhiteboardUndoRef.current = onWhiteboardUndo;
  onWhiteboardRedoRef.current = onWhiteboardRedo;
  onWhiteboardClearRef.current = onWhiteboardClear;
  onWhiteboardScrollRef.current = onWhiteboardScroll;
  onWhiteboardEraseRectRef.current = onWhiteboardEraseRect;
  onWhiteboardSnapshotRef.current = onWhiteboardSnapshot;
  onWhiteboardCursorRef.current = onWhiteboardCursor;
  onWhiteboardTextRef.current = onWhiteboardText;
  onWhiteboardAssetRef.current = onWhiteboardAsset;
  onWhiteboardShapeRef.current = onWhiteboardShape;
  onWhiteboardTextUpdateRef.current = onWhiteboardTextUpdate;
  onWhiteboardTextDeleteRef.current = onWhiteboardTextDelete;
  onWhiteboardShapeDeleteRef.current = onWhiteboardShapeDelete;
  onWhiteboardHistoryStateRef.current = onWhiteboardHistoryState;
  onScreenShareForceStopRef.current = onScreenShareForceStop;

  // Wait for the local camera/mic stream to be ready before creating an
  // offer or answer. WebRTC does not automatically renegotiate when tracks
  // are added to an already-connected peer connection, so if we negotiate
  // before getUserMedia() resolves, that peer's video (and/or audio) never
  // reaches the other side even though the connection looks "fine".
  const waitForLocalStream = useCallback((timeoutMs = 8000) => {
    return new Promise<void>((resolve) => {
      if (localStreamRef.current) {
        resolve();
        return;
      }
      const start = Date.now();
      const interval = setInterval(() => {
        if (localStreamRef.current || Date.now() - start > timeoutMs) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }, []);

  // Create an RTCPeerConnection for a remote peer
  const createPeerConnection = useCallback((remoteSocketId: string) => {
    if (peerConnections.current.has(remoteSocketId)) {
      return peerConnections.current.get(remoteSocketId)!;
    }

    const pc = new RTCPeerConnection(rtcConfiguration);
    peerConnections.current.set(remoteSocketId, pc);

    // Add local tracks
    const currentStream =
      isSharingScreenRef.current && screenStreamRef.current
        ? screenStreamRef.current
        : localStreamRef.current;

    if (currentStream) {
      currentStream.getTracks().forEach((track) => {
        pc.addTrack(track, currentStream);
      });
    }

    // ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('webrtc:ice-candidate', {
          targetSocketId: remoteSocketId,
          senderSocketId: socketRef.current.id || undefined,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Receive Remote Tracks — fix: listen for track mutations to force re-render
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;

      const updateStream = () => {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          // Always replace with a fresh MediaStream wrapper so React sees the change
          const fresh = new MediaStream(stream.getTracks());
          next.set(remoteSocketId, fresh);
          return next;
        });
      };

      updateStream();

      // Re-trigger on track changes (e.g. replaceTrack for screen share)
      event.track.onunmute = updateStream;
      event.track.onended = () => {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          // Re-clone stream without ended track so video el re-binds correctly
          const remaining = stream.getTracks().filter((t) => t.readyState !== 'ended');
          if (remaining.length > 0) {
            next.set(remoteSocketId, new MediaStream(remaining));
          }
          return next;
        });
      };
    };

    // Connection State Monitoring
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionQuality('EXCELLENT');
      } else if (pc.iceConnectionState === 'disconnected') {
        setConnectionQuality('UNSTABLE');
      } else if (pc.iceConnectionState === 'failed') {
        setConnectionQuality('POOR');
      }
    };

    return pc;
  }, []);

  // Initialize Socket.IO connection & event handlers ONLY once per meetingCode
  useEffect(() => {
    if (!meetingCode) return;

    const hostAccessKey = typeof window !== 'undefined'
      ? localStorage.getItem('boom_personal_room_key') || undefined
      : undefined;

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: { hostAccessKey },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setMeetingState('CONNECTING');

      socket.emit(
        'meeting:join',
        {
          meetingCode,
          displayName: displayNameRef.current,
          audioEnabled: audioEnabledRef.current,
          videoEnabled: videoEnabledRef.current,
          hostAccessKey,
        },
        (res) => {
          if (!res.success) {
            setErrorMessage(res.error || 'Failed to join meeting.');
            setMeetingState('ERROR');
          }
        }
      );
    });

    socket.on('connect_error', () => {
      setConnectionQuality('POOR');
      setMeetingState('RECONNECTING');
    });

    socket.io.on('reconnect', () => {
      setConnectionQuality('EXCELLENT');
      setMeetingState('CONNECTED');
    });

    // Room Joined
    socket.on('room:joined', async (data) => {
      setMeeting(data.meeting);
      setLocalParticipant(data.participant);
      setParticipants(data.participants);
      setMessages(data.messages);

      // Permission is tied to this live socket session. Never carry a previous
      // grant across a reconnect/new socket: only the server can grant access.
      setPendingScreenShareRequest(null);
      setPendingWhiteboardRequest(null);
      setScreenSharePermission(data.participant.isHost ? 'granted' : 'idle');
      setWhiteboardPermission(data.participant.isHost ? 'granted' : 'idle');
      if (data.whiteboardState) setWhiteboardState(data.whiteboardState);
      onWhiteboardSnapshotRef.current?.(data.whiteboardHistory || [], data.whiteboardAsset || null, (data as any).whiteboardTexts || [], (data as any).whiteboardShapes || []);
      onWhiteboardHistoryStateRef.current?.({ canUndo: !!(data as any).canUndo, canRedo: !!(data as any).canRedo });
      setMeetingState('CONNECTED');

      // Ensure our own camera/mic are ready before negotiating, so the
      // initial offer actually includes our audio+video tracks.
      await waitForLocalStream();

      for (const p of data.participants) {
        if (p.id !== data.participant.id) {
          try {
            const pc = createPeerConnection(p.id);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socket.emit('webrtc:offer', {
              targetSocketId: p.id,
              callerSocketId: data.participant.id,
              callerName: data.participant.displayName,
              sdp: offer,
            });
          } catch (err) {
            console.error('Failed to create offer for peer:', p.id, err);
          }
        }
      }
    });

    socket.on('participant:joined', (newParticipant) => {
      setParticipants((prev) => {
        if (prev.some((p) => p.id === newParticipant.id)) return prev;
        return [...prev, newParticipant];
      });
    });

    socket.on('participant:left', ({ participantId }) => {
      setParticipants((prev) => prev.filter((p) => p.id !== participantId));
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(participantId);
        return next;
      });

      const pc = peerConnections.current.get(participantId);
      if (pc) {
        pc.close();
        peerConnections.current.delete(participantId);
      }
    });

    socket.on('participant:updated', (updated) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
      setLocalParticipant((prev) => (prev?.id === updated.id ? updated : prev));
    });

    socket.on('participant:muted', ({ participantId, mutedByHost, media = 'audio' }) => {
      if (socket.id === participantId && mutedByHost) {
        onHostMediaDisabledRef.current?.(media);
        if (localStreamRef.current) {
          const track = media === 'video'
            ? localStreamRef.current.getVideoTracks()[0]
            : localStreamRef.current.getAudioTracks()[0];
          if (track) track.enabled = false;
        }
      }
    });

    socket.on('participant:removed', ({ participantId, reason }) => {
      if (socket.id === participantId) {
        setMeetingState('REMOVED');
        onKickedRef.current?.(reason);
      }
    });

    socket.on('meeting:ended', ({ reason }) => {
      setMeetingState('ENDED');
      onMeetingEndedRef.current?.(reason);
    });

    socket.on('chat:message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    // Screen Share events
    socket.on('screenShare:started', ({ participantId, displayName: sharerName }) => {
      setScreenSharer({ id: participantId, name: sharerName });
    });

    socket.on('screenShare:stopped', () => {
      setScreenSharer(null);
    });

    // Permission: Host receives a screen share request
    socket.on('screenShare:requested', (data) => {
      setPendingScreenShareRequest(data);
    });

    // Permission: Viewer receives approval
    socket.on('screenShare:permissionGranted', () => {
      setScreenSharePermission('granted');
    });

    // Permission: Viewer receives denial
    socket.on('screenShare:permissionDenied', () => { setScreenSharePermission('denied'); });
    socket.on('screenShare:permissionRevoked', () => { setScreenSharePermission('denied'); });
    socket.on('screenShare:forceStop', ({ reason }) => { setScreenSharePermission('denied'); onScreenShareForceStopRef.current?.(reason); });

    // Permission: Host receives a whiteboard editing request
    socket.on('whiteboard:requested', (data) => {
      setPendingWhiteboardRequest(data);
    });

    // Viewer receives whiteboard editing approval
    socket.on('whiteboard:permissionGranted', () => {
      setWhiteboardPermission('granted');
    });

    // Viewer receives whiteboard editing denial
    socket.on('whiteboard:permissionDenied', () => { setWhiteboardPermission('denied'); });
    socket.on('whiteboard:permissionRevoked', () => { setWhiteboardPermission('denied'); });

    // Whiteboard Events
    socket.on('whiteboard:toggle', (state) => {
      setWhiteboardState(state);
    });

    socket.on('whiteboard:draw', (data) => {
      onWhiteboardDrawRef.current?.(data.line, data.senderId);
    });

    socket.on('whiteboard:strokeEnd', (data) => {
      onWhiteboardStrokeEndRef.current?.(data.senderId);
    });

    socket.on('whiteboard:undo', (data) => { onWhiteboardSnapshotRef.current?.(data.history, data.asset, data.texts || [], (data as any).shapes || []); onWhiteboardHistoryStateRef.current?.({ canUndo: !!data.canUndo, canRedo: !!data.canRedo }); });

    socket.on('whiteboard:redo', (data) => { onWhiteboardSnapshotRef.current?.(data.history, data.asset, data.texts || [], (data as any).shapes || []); onWhiteboardHistoryStateRef.current?.({ canUndo: !!data.canUndo, canRedo: !!data.canRedo }); });

    socket.on('whiteboard:clear', () => {
      onWhiteboardClearRef.current?.();
    });

    socket.on('whiteboard:scroll', (data) => {
      onWhiteboardScrollRef.current?.(data.scrollTop);
    });

    socket.on('whiteboard:eraseRect', (data) => { onWhiteboardEraseRectRef.current?.(data.rect); });
    socket.on('whiteboard:snapshot', (data) => { onWhiteboardSnapshotRef.current?.(data.history, data.asset, data.texts || [], (data as any).shapes || []); });
    socket.on('whiteboard:cursor', (data) => { onWhiteboardCursorRef.current?.(data); });
    socket.on('whiteboard:asset', ({ asset }) => { onWhiteboardAssetRef.current?.(asset); });
    socket.on('whiteboard:text', ({ text }) => { onWhiteboardTextRef.current?.(text); });
    socket.on('whiteboard:textUpdate', ({ text }) => { onWhiteboardTextUpdateRef.current?.(text); });
    socket.on('whiteboard:textDelete', ({ textId }) => { onWhiteboardTextDeleteRef.current?.(textId); });
    socket.on('whiteboard:shape', ({ shape }) => { onWhiteboardShapeRef.current?.(shape); });
    socket.on('whiteboard:shapeUpdate', ({ shape }) => { onWhiteboardShapeRef.current?.(shape); });
    socket.on('whiteboard:shapeDelete', ({ shapeId }) => { onWhiteboardShapeDeleteRef.current?.(shapeId); });
    socket.on('whiteboard:historyState', (state) => { onWhiteboardHistoryStateRef.current?.(state); });

    // WebRTC Offer Received
    socket.on('webrtc:offer', async (payload) => {
      try {
        // Make sure our own camera/mic are ready before answering, so the
        // answer SDP includes our tracks too (otherwise the caller never
        // sees our video/audio even though the connection succeeds).
        await waitForLocalStream();

        const pc = createPeerConnection(payload.callerSocketId);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc:answer', {
          targetSocketId: payload.callerSocketId,
          responderSocketId: socket.id || '',
          sdp: answer,
        });
      } catch (err) {
        console.error('Error handling WebRTC offer:', err);
      }
    });

    // WebRTC Answer Received
    socket.on('webrtc:answer', async (payload) => {
      try {
        const pc = peerConnections.current.get(payload.responderSocketId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }
      } catch (err) {
        console.error('Error handling WebRTC answer:', err);
      }
    });

    // ICE Candidate
    socket.on('webrtc:ice-candidate', async (payload) => {
      try {
        const remoteSocketId = payload.senderSocketId || payload.targetSocketId;
        const pc = peerConnections.current.get(remoteSocketId);
        if (pc && payload.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    });

    return () => {
      socket.disconnect();
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
    };
  }, [meetingCode, createPeerConnection]);

  // Sync local tracks across peer connections when stream or screen share changes
  useEffect(() => {
    const activeStream =
      isSharingScreen && screenStream ? screenStream : localStream;
    if (!activeStream) return;

    const videoTrack = activeStream.getVideoTracks()[0] || null;
    const audioTrack = activeStream.getAudioTracks()[0] || null;

    peerConnections.current.forEach((pc) => {
      const senders = pc.getSenders();

      const videoSender =
        senders.find((s) => s.track?.kind === 'video') ||
        pc.getTransceivers().find(
          (t) => t.sender.track?.kind === 'video' || t.receiver.track?.kind === 'video'
        )?.sender;

      if (videoSender) {
        // When camera capture is stopped, explicitly detach the sender so the
        // remote peer stops receiving the ended camera track. Screen sharing
        // remains unaffected because activeStream is the screen stream then.
        videoSender.replaceTrack(videoTrack || null).catch(console.error);
      } else if (videoTrack) {
        pc.addTrack(videoTrack, activeStream);
      }

      const audioSender =
        senders.find((s) => s.track?.kind === 'audio') ||
        pc.getTransceivers().find(
          (t) => t.sender.track?.kind === 'audio' || t.receiver.track?.kind === 'audio'
        )?.sender;

      if (audioSender && audioTrack) {
        audioSender.replaceTrack(audioTrack).catch(console.error);
      } else if (!audioSender && audioTrack) {
        pc.addTrack(audioTrack, activeStream);
      }

      // Keep microphone delivery on a stable Opus configuration. Mono voice
      // audio avoids unnecessary stereo processing and a moderate bitrate is
      // much more resilient on ordinary Wi-Fi/mobile connections.
      const currentAudioSender =
        pc.getSenders().find((sender) => sender.track?.kind === 'audio') || audioSender;
      if (currentAudioSender) {
        try {
          const parameters = currentAudioSender.getParameters();
          const encodings = parameters.encodings?.length ? parameters.encodings : [{}];
          parameters.encodings = encodings.map((encoding: RTCRtpEncodingParameters) => ({
            ...encoding,
            maxBitrate: 64000,
            dtx: true,
          }));
          currentAudioSender.setParameters(parameters).catch(() => {
            // Some browsers do not expose these RTP sender parameters.
          });
        } catch {
          // Keep the browser's default WebRTC audio configuration.
        }
      }
    });

    if (socketRef.current?.connected) {
      socketRef.current.emit('participant:toggleMedia', {
        audioEnabled,
        videoEnabled,
      });
    }
  }, [localStream, screenStream, isSharingScreen, audioEnabled, videoEnabled]);

  // User Actions
  const sendMessage = useCallback((text: string) => {
    if (!socketRef.current || !text.trim()) return;
    socketRef.current.emit('chat:send', { message: text });
  }, []);

  const muteParticipant = useCallback((targetParticipantId: string, media: 'audio' | 'video' = 'audio') => {
    socketRef.current?.emit('participant:mute', { targetParticipantId, media });
  }, []);

  const removeParticipant = useCallback((targetParticipantId: string) => {
    socketRef.current?.emit('participant:remove', { targetParticipantId });
  }, []);

  const endMeetingForEveryone = useCallback((callback?: () => void) => {
    if (!socketRef.current) return;
    socketRef.current.emit('meeting:end', (res) => {
      if (res.success) {
        setMeetingState('ENDED');
        callback?.();
      }
    });
  }, []);

  const leaveMeeting = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('meeting:leave');
      socketRef.current.disconnect();
    }
    setMeetingState('ENDED');
  }, []);

  const broadcastScreenShareStart = useCallback(() => {
    socketRef.current?.emit('screenShare:start');
  }, []);

  const broadcastScreenShareStop = useCallback(() => {
    socketRef.current?.emit('screenShare:stop');
  }, []);

  // Screen Share Permission Actions
  const requestScreenSharePermission = useCallback(() => {
    setScreenSharePermission('pending');
    socketRef.current?.emit('screenShare:request');
  }, []);

  const respondToScreenShareRequest = useCallback((requesterSocketId: string, approved: boolean) => {
    socketRef.current?.emit('screenShare:requestResponse', { requesterSocketId, approved });
    setPendingScreenShareRequest(null);
  }, []);

  const resetScreenSharePermission = useCallback(() => {
    setScreenSharePermission('idle');
  }, []);

  // Whiteboard Permission Actions
  const requestWhiteboardPermission = useCallback(() => {
    setWhiteboardPermission('pending');
    socketRef.current?.emit('whiteboard:request');
  }, []);

  const respondToWhiteboardRequest = useCallback((requesterSocketId: string, approved: boolean) => {
    socketRef.current?.emit('whiteboard:requestResponse', { requesterSocketId, approved });
    setPendingWhiteboardRequest(null);
  }, []);

  const resetWhiteboardPermission = useCallback(() => {
    setWhiteboardPermission('idle');
  }, []);

  // Whiteboard Actions
  const toggleWhiteboard = useCallback((isOpen: boolean) => {
    socketRef.current?.emit('whiteboard:toggle', { isOpen });
  }, []);

  const sendWhiteboardDraw = useCallback((line: DrawLinePayload) => {
    socketRef.current?.emit('whiteboard:draw', { line });
  }, []);

  const sendWhiteboardStrokeEnd = useCallback(() => {
    socketRef.current?.emit('whiteboard:strokeEnd');
  }, []);

  const sendWhiteboardUndo = useCallback(() => {
    socketRef.current?.emit('whiteboard:undo');
  }, []);

  const sendWhiteboardRedo = useCallback(() => {
    socketRef.current?.emit('whiteboard:redo');
  }, []);

  const sendWhiteboardClear = useCallback(() => {
    socketRef.current?.emit('whiteboard:clear');
  }, []);

  const sendWhiteboardScroll = useCallback((scrollTop: number) => {
    socketRef.current?.emit('whiteboard:scroll', { scrollTop });
  }, []);

  const sendWhiteboardEraseRect = useCallback((rect: EraseRectPayload) => {
    socketRef.current?.emit('whiteboard:eraseRect', { rect });
  }, []);

  const revokeScreenShare = useCallback((targetParticipantId: string) => { socketRef.current?.emit('screenShare:revoke', { targetParticipantId }); }, []);
  const revokeWhiteboardAccess = useCallback((targetParticipantId: string) => { socketRef.current?.emit('whiteboard:revoke', { targetParticipantId }); }, []);
  const sendWhiteboardCursor = useCallback((cursor: Omit<WhiteboardCursor,'participantId'|'displayName'>) => { socketRef.current?.emit('whiteboard:cursor', cursor); }, []);
  const sendWhiteboardAsset = useCallback((asset: WhiteboardAsset | null) => { socketRef.current?.emit('whiteboard:asset', { asset }); }, []);
  const sendWhiteboardText = useCallback((text: WhiteboardText) => { socketRef.current?.emit('whiteboard:text', { text }); }, []);
  const sendWhiteboardTextUpdate = useCallback((text: WhiteboardText) => { socketRef.current?.emit('whiteboard:textUpdate', { text }); }, []);
  const sendWhiteboardTextDelete = useCallback((textId: string) => { socketRef.current?.emit('whiteboard:textDelete', { textId }); }, []);
  const sendWhiteboardShape = useCallback((shape: WhiteboardShape) => { socketRef.current?.emit('whiteboard:shape', { shape }); }, []);
  const sendWhiteboardShapeUpdate = useCallback((shape: WhiteboardShape) => { socketRef.current?.emit('whiteboard:shapeUpdate', { shape }); }, []);
  const sendWhiteboardShapeDelete = useCallback((shapeId: string) => { socketRef.current?.emit('whiteboard:shapeDelete', { shapeId }); }, []);

  return {
    meetingState,
    meeting,
    localParticipant,
    participants,
    remoteStreams,
    messages,
    screenSharer,
    whiteboardState,
    connectionQuality,
    errorMessage,
    pendingScreenShareRequest,
    screenSharePermission,
    pendingWhiteboardRequest,
    whiteboardPermission,
    sendMessage,
    muteParticipant,
    removeParticipant,
    endMeetingForEveryone,
    leaveMeeting,
    broadcastScreenShareStart,
    broadcastScreenShareStop,
    requestScreenSharePermission,
    respondToScreenShareRequest,
    resetScreenSharePermission,
    requestWhiteboardPermission,
    respondToWhiteboardRequest,
    resetWhiteboardPermission,
    toggleWhiteboard,
    sendWhiteboardDraw,
    sendWhiteboardStrokeEnd,
    sendWhiteboardUndo,
    sendWhiteboardRedo,
    sendWhiteboardClear,
    sendWhiteboardScroll,
    sendWhiteboardEraseRect,
    revokeScreenShare,
    revokeWhiteboardAccess,
    sendWhiteboardCursor,
    sendWhiteboardAsset,
    sendWhiteboardText,
    sendWhiteboardTextUpdate,
    sendWhiteboardTextDelete,
    sendWhiteboardShape,
    sendWhiteboardShapeUpdate,
    sendWhiteboardShapeDelete,
  };
}