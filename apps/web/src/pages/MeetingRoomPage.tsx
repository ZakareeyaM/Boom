import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { RotateCw, AlertTriangle } from 'lucide-react';
import { Button } from '../components/common/Button';
import { VideoGrid } from '../components/meeting/VideoGrid';
import { ScreenShareStage } from '../components/meeting/ScreenShareStage';
import { WhiteboardStage } from '../components/meeting/WhiteboardStage';
import { ControlBar } from '../components/meeting/ControlBar';
import { ChatDrawer } from '../components/meeting/ChatDrawer';
import { ParticipantsDrawer } from '../components/meeting/ParticipantsDrawer';
import { DeviceSelectorModal } from '../components/meeting/DeviceSelectorModal';
import {
  RemoveParticipantModal,
  EndMeetingModal,
  LeaveMeetingModal,
} from '../components/meeting/HostActionModals';
import { ScreenShareRequestModal } from '../components/meeting/ScreenShareRequestModal';
import { WhiteboardRequestModal } from '../components/meeting/WhiteboardRequestModal';
import { useMediaStream } from '../hooks/useMediaStream';
import { useScreenShare } from '../hooks/useScreenShare';
import { useWebRTC } from '../hooks/useWebRTC';
import type { Participant, DrawLinePayload, EraseRectPayload, WhiteboardAsset, WhiteboardCursor, WhiteboardText, WhiteboardShape } from '@boom/types';

const RemoteAudioPlayer: React.FC<{ stream: MediaStream | null; enabled: boolean }> = ({ stream, enabled }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const attachedTrackIdRef = useRef<string | null>(null);

  const audioTrack = stream?.getAudioTracks()[0] || null;
  const trackId = audioTrack?.id || null;
  const isLive = audioTrack && audioTrack.readyState === 'live';

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioTrack || !isLive) {
      if (audio.srcObject) {
        audio.srcObject = null;
      }
      attachedTrackIdRef.current = null;
      return;
    }

    // Only assign srcObject if the track has actually changed to prevent audio decoding resets / clicking
    if (attachedTrackIdRef.current !== trackId || !audio.srcObject) {
      attachedTrackIdRef.current = trackId;
      audio.srcObject = new MediaStream([audioTrack]);
    }

    audio.muted = !enabled;

    if (enabled && audio.paused) {
      audio.play().catch(() => {});
    }
  }, [trackId, isLive, enabled]);

  // Autoplay policy unlock on user interaction
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const unlockAutoplay = () => {
      if (audio.paused && enabled && audio.srcObject) {
        audio.play().catch(() => {});
      }
    };

    window.addEventListener('click', unlockAutoplay, { once: true });
    window.addEventListener('keydown', unlockAutoplay, { once: true });
    window.addEventListener('touchstart', unlockAutoplay, { once: true });

    return () => {
      window.removeEventListener('click', unlockAutoplay);
      window.removeEventListener('keydown', unlockAutoplay);
      window.removeEventListener('touchstart', unlockAutoplay);
    };
  }, [enabled]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      controls={false}
      preload="auto"
    />
  );
};

export const MeetingRoomPage: React.FC = () => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const meetingCode = meetingId || '';
  const location = useLocation();
  const navigate = useNavigate();

  const stateData = (location.state as any) || {};
  const displayName = stateData.displayName || 'Guest';
  const initialAudio = stateData.audioEnabled !== undefined ? stateData.audioEnabled : true;
  const initialVideo = stateData.videoEnabled !== undefined ? stateData.videoEnabled : true;

  // Media Stream
  const {
    stream: localStream,
    audioEnabled,
    videoEnabled,
    devices,
    selectedAudioId,
    selectedVideoId,
    toggleAudio,
    setAudioState,
    toggleVideo,
    setVideoState,
    switchAudioDevice,
    switchVideoDevice,
  } = useMediaStream(initialAudio, initialVideo);

  // Screen Share Hook
  const {
    screenStream,
    isSharing: isSharingScreen,
    startScreenShare,
    stopScreenShare,
  } = useScreenShare(() => {
    broadcastScreenShareStop();
  }, localStream);

  // UI State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatAlert, setChatAlert] = useState(false);
  const [showVideoGrid, setShowVideoGrid] = useState(true);
  const [whiteboardHistory, setWhiteboardHistory] = useState<DrawLinePayload[][]>([]);
  const [whiteboardAsset, setWhiteboardAsset] = useState<WhiteboardAsset | null>(null);
  const [whiteboardCursors, setWhiteboardCursors] = useState<Map<string, WhiteboardCursor>>(new Map());
  const [whiteboardTexts, setWhiteboardTexts] = useState<WhiteboardText[]>([]);
  const [whiteboardShapes, setWhiteboardShapes] = useState<WhiteboardShape[]>([]);
  const [whiteboardCanUndo, setWhiteboardCanUndo] = useState(false);
  const [whiteboardCanRedo, setWhiteboardCanRedo] = useState(false);

  // Modals State
  const [targetRemoveParticipant, setTargetRemoveParticipant] = useState<Participant | null>(null);
  const [isEndMeetingModalOpen, setIsEndMeetingModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);

  // Session timer: starts once when this meeting room is mounted and keeps
  // running through whiteboard/theme changes and reconnects.
  const sessionStartedAtRef = useRef<number>(Date.now());
  const [sessionElapsedSeconds, setSessionElapsedSeconds] = useState(0);

  useEffect(() => {
    const updateTimer = () => {
      setSessionElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - sessionStartedAtRef.current) / 1000))
      );
    };

    updateTimer();
    const timerId = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const formatSessionTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Remote Whiteboard Draw Handlers
  const handleRemoteDraw = useCallback((line: DrawLinePayload, senderId: string) => {
    if (typeof (window as any).__boom_drawSegment === 'function') {
      (window as any).__boom_drawSegment(
        line.prevX,
        line.prevY,
        line.currX,
        line.currY,
        line.color,
        line.size,
        line.isEraser,
        senderId
      );
    }
  }, []);

  const handleRemoteStrokeEnd = useCallback((senderId: string) => {
    if (typeof (window as any).__boom_strokeEnd === 'function') {
      (window as any).__boom_strokeEnd(senderId);
    }
  }, []);

  const handleRemoteUndo = useCallback(() => {
    if (typeof (window as any).__boom_undo === 'function') {
      (window as any).__boom_undo();
    }
  }, []);

  const handleRemoteClear = useCallback(() => {
    setWhiteboardHistory([]); setWhiteboardTexts([]); setWhiteboardShapes([]); setWhiteboardAsset(null);
    if (typeof (window as any).__boom_clearCanvas === 'function') (window as any).__boom_clearCanvas();
  }, []);

  const handleRemoteScroll = useCallback((scrollTop: number) => {
    if (typeof (window as any).__boom_scrollTo === 'function') {
      (window as any).__boom_scrollTo(scrollTop);
    }
  }, []);

  const handleRemoteEraseRect = useCallback((rect: EraseRectPayload) => {
    if (typeof (window as any).__boom_eraseRect === 'function') {
      (window as any).__boom_eraseRect(rect);
    }
  }, []);

  // WebRTC & Signalling Hook
  const {
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
    sendMessage,
    muteParticipant,
    removeParticipant,
    endMeetingForEveryone,
    leaveMeeting,
    broadcastScreenShareStart,
    broadcastScreenShareStop,
    pendingScreenShareRequest,
    screenSharePermission,
    respondToScreenShareRequest,
    requestScreenSharePermission,
    pendingWhiteboardRequest,
    whiteboardPermission,
    requestWhiteboardPermission,
    respondToWhiteboardRequest,
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
  } = useWebRTC({
    meetingCode,
    displayName,
    localStream,
    audioEnabled,
    videoEnabled,
    screenStream,
    isSharingScreen,
    onKicked: (reason) => {
      navigate('/removed', { state: { reason } });
    },
    onMeetingEnded: (reason) => {
      navigate('/ended', { state: { reason } });
    },
    onHostMediaDisabled: (media) => {
      if (media === 'video') setVideoState(false);
      else setAudioState(false);
    },
    onWhiteboardDraw: handleRemoteDraw,
    onWhiteboardStrokeEnd: handleRemoteStrokeEnd,
    onWhiteboardUndo: handleRemoteUndo,
    onWhiteboardRedo: () => {
      if (typeof (window as any).__boom_redo === 'function') {
        (window as any).__boom_redo();
      }
    },
    onWhiteboardClear: handleRemoteClear,
    onWhiteboardScroll: handleRemoteScroll,
    onWhiteboardEraseRect: handleRemoteEraseRect,
    onWhiteboardSnapshot: (history, asset, texts, shapes) => { setWhiteboardHistory(history); setWhiteboardAsset(asset); setWhiteboardTexts(texts); setWhiteboardShapes(shapes || []); },
    onWhiteboardText: (text) => setWhiteboardTexts(prev => [...prev.filter(t => t.id !== text.id), text]),
    onWhiteboardTextUpdate: (text) => setWhiteboardTexts(prev => prev.map(t => t.id === text.id ? text : t)),
    onWhiteboardTextDelete: (textId) => setWhiteboardTexts(prev => prev.filter(t => t.id !== textId)),
    onWhiteboardHistoryState: ({ canUndo, canRedo }) => { setWhiteboardCanUndo(canUndo); setWhiteboardCanRedo(canRedo); },
    onWhiteboardShape: (shape) => setWhiteboardShapes(prev => [...prev.filter(s => s.id !== shape.id), shape]),
    onWhiteboardShapeDelete: (shapeId) => setWhiteboardShapes(prev => prev.filter(s => s.id !== shapeId)),
    onWhiteboardAsset: (asset) => setWhiteboardAsset(asset),
    onWhiteboardCursor: (cursor) => { setWhiteboardCursors(prev => { const next = new Map(prev); if (cursor.visible) next.set(cursor.participantId, cursor); else next.delete(cursor.participantId); return next; }); },
    onScreenShareForceStop: () => { stopScreenShare(); },
  });

  const isHost = localParticipant?.isHost || false;
  const canEditWhiteboard = isHost || whiteboardPermission === 'granted';

  // Track unread messages and briefly pulse the chat button for everyone
  // who receives a message while their chat drawer is closed.
  const prevMessagesCount = React.useRef(messages.length);
  const messagesInitialized = React.useRef(false);
  useEffect(() => {
    if (!localParticipant) return;
    if (!messagesInitialized.current) {
      prevMessagesCount.current = messages.length;
      messagesInitialized.current = true;
      return;
    }
    if (messages.length > prevMessagesCount.current) {
      const newMessages = messages.slice(prevMessagesCount.current);
      const incoming = newMessages.some((message) => message.senderId !== localParticipant?.id);
      if (!isChatOpen && incoming) {
        setUnreadCount((prev) => prev + newMessages.filter((m) => m.senderId !== localParticipant?.id).length);
        setChatAlert(true);
      }
    }
    prevMessagesCount.current = messages.length;
  }, [messages, isChatOpen, localParticipant?.id]);

  const handleToggleChat = () => {
    setIsChatOpen((prev) => {
      if (!prev) {
        setUnreadCount(0);
        setChatAlert(false);
      }
      return !prev;
    });
    if (isParticipantsOpen) setIsParticipantsOpen(false);
  };

  const handleToggleParticipants = () => {
    setIsParticipantsOpen((prev) => !prev);
    if (isChatOpen) setIsChatOpen(false);
  };

  const handleToggleScreenShare = async () => {
    if (isSharingScreen) {
      stopScreenShare();
      broadcastScreenShareStop();
      return;
    }

    // The host can start sharing immediately. Other participants must first
    // ask the host for permission. The actual getDisplayMedia() call stays
    // inside this click handler because browsers require a user gesture.
    if (!isHost && screenSharePermission !== 'granted') {
      if (screenSharePermission !== 'pending') {
        // Request permission only; do not call getDisplayMedia yet.
        requestScreenSharePermission();
      }
      return;
    }

    const stream = await startScreenShare();
    if (stream) {
      broadcastScreenShareStart();
    }
  };

  const handleToggleWhiteboard = () => {
    if (!isHost) return;
    toggleWhiteboard(!whiteboardState.isOpen);
  };

  // If meeting state is connecting
  if (meetingState === 'CONNECTING') {
    return (
      <div className="h-screen w-screen bg-dark-bg flex flex-col items-center justify-center text-slate-400 space-y-3">
        <RotateCw className="w-8 h-8 animate-spin text-brand-500" />
        <p className="text-sm font-medium">Entering meeting room...</p>
      </div>
    );
  }

  // If meeting failed or error occurred
  if (meetingState === 'ERROR') {
    return (
      <div className="h-screen w-screen bg-dark-bg flex flex-col items-center justify-center p-4 text-center max-w-md mx-auto space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white">Meeting Unavailable</h2>
        <p className="text-sm text-slate-400 leading-relaxed">{errorMessage}</p>
        <Button variant="primary" onClick={() => navigate('/')}>
          Return to Home
        </Button>
      </div>
    );
  }

  const remoteParticipants = participants.filter((p) => p.id !== localParticipant?.id);

  return (
    <div className="h-screen w-screen bg-dark-bg text-slate-100 flex flex-col overflow-hidden relative select-none">
      {/* Main Stage Presentation Area */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden">
        {/* Reconnecting overlay alert */}
        {meetingState === 'RECONNECTING' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500/90 text-black px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 shadow-xl animate-pulse">
            <RotateCw className="w-3.5 h-3.5 animate-spin" />
            Connection lost. Reconnecting...
          </div>
        )}

        {/* Priority 1: Collaborative Whiteboard */}
        {whiteboardState.isOpen ? (
          <WhiteboardStage
            whiteboardState={whiteboardState}
            localParticipant={localParticipant!}
            localStream={localStream}
            remoteParticipants={remoteParticipants}
            remoteStreams={remoteStreams}
            connectionQuality={connectionQuality}
            isHost={isHost}
            canEdit={canEditWhiteboard}
            whiteboardPermission={whiteboardPermission}
            onRequestEdit={requestWhiteboardPermission}
            onDraw={sendWhiteboardDraw}
            onStrokeEnd={sendWhiteboardStrokeEnd}
            onUndo={sendWhiteboardUndo}
            onRedo={sendWhiteboardRedo}
            onClear={() => { setWhiteboardHistory([]); setWhiteboardTexts([]); setWhiteboardShapes([]); setWhiteboardAsset(null); sendWhiteboardClear(); }}
            onScroll={sendWhiteboardScroll}
            onEraseRect={sendWhiteboardEraseRect}
            whiteboardHistory={whiteboardHistory}
            whiteboardAsset={whiteboardAsset}
            remoteCursors={whiteboardCursors}
            whiteboardTexts={whiteboardTexts}
            whiteboardShapes={whiteboardShapes}
            canUndo={whiteboardCanUndo}
            canRedo={whiteboardCanRedo}
            onText={sendWhiteboardText}
            onTextUpdate={sendWhiteboardTextUpdate}
            onTextDelete={(textId) => { setWhiteboardTexts(prev => prev.filter(t => t.id !== textId)); sendWhiteboardTextDelete(textId); }}
            onShape={sendWhiteboardShape}
            onShapeUpdate={(shape)=>{setWhiteboardShapes(prev=>prev.map(s=>s.id===shape.id?shape:s));sendWhiteboardShapeUpdate(shape);}}
            onShapeDelete={sendWhiteboardShapeDelete}
            onCursor={sendWhiteboardCursor}
            onAsset={sendWhiteboardAsset}
            onClose={() => toggleWhiteboard(false)}
          />
        ) : screenSharer || isSharingScreen ? (
          /* Priority 2: Screen Share Stage */
          <ScreenShareStage
            sharerName={screenSharer?.name || displayName}
            isLocalSharer={isSharingScreen}
            screenStream={
              isSharingScreen
                ? screenStream
                : remoteStreams.get(screenSharer?.id || '') || null
            }
            onStopSharing={() => {
              stopScreenShare();
              broadcastScreenShareStop();
            }}
          />
        ) : (
          /* Priority 3: Dynamic Adaptive Video Grid */
          localParticipant && (
            <VideoGrid
              localParticipant={localParticipant}
              localStream={localStream}
              remoteParticipants={remoteParticipants}
              remoteStreams={remoteStreams}
              connectionQuality={connectionQuality}
              showVideos={showVideoGrid}
              onToggleVideos={() => setShowVideoGrid((prev) => !prev)}
            />
          )
        )}
      </div>

      {/* Global persistent remote audio playback */}
      <div
        style={{
          position: 'fixed',
          top: -9999,
          left: -9999,
          opacity: 0,
          pointerEvents: 'none',
          width: 0,
          height: 0,
        }}
        aria-hidden="true"
      >
        {remoteParticipants.map((p) => (
          <RemoteAudioPlayer
            key={p.id}
            stream={remoteStreams.get(p.id) || null}
            enabled={p.audioEnabled}
          />
        ))}
      </div>

      {/* Bottom Floating Control Bar */}
      <ControlBar
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        isSharingScreen={isSharingScreen}
        isWhiteboardOpen={whiteboardState.isOpen}
        participantCount={participants.length}
        unreadCount={unreadCount}
        chatAlert={chatAlert}
        sessionTime={formatSessionTime(sessionElapsedSeconds)}
        isChatOpen={isChatOpen}
        isParticipantsOpen={isParticipantsOpen}
        isHost={isHost}
        screenSharePermission={screenSharePermission}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleWhiteboard={handleToggleWhiteboard}
        onToggleChat={handleToggleChat}
        onToggleParticipants={handleToggleParticipants}
        onOpenDeviceSettings={() => setIsDeviceModalOpen(true)}
        onLeaveMeeting={() => setIsLeaveModalOpen(true)}
        onEndMeeting={() => setIsEndMeetingModalOpen(true)}
      />

      {/* Side Chat Drawer */}
      <ChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={messages}
        currentUserId={localParticipant?.id || ''}
        onSendMessage={sendMessage}
      />

      {/* Side Participants Drawer */}
      <ParticipantsDrawer
        isOpen={isParticipantsOpen}
        onClose={() => setIsParticipantsOpen(false)}
        participants={participants}
        currentUserId={localParticipant?.id || ''}
        isHost={isHost}
        meetingCode={meetingCode}
        onMuteParticipant={muteParticipant}
        onRevokeScreenShare={revokeScreenShare}
        onRevokeWhiteboardAccess={revokeWhiteboardAccess}
        onRequestRemoveParticipant={(p) => setTargetRemoveParticipant(p)}
      />

      {/* Device Settings Modal */}
      <DeviceSelectorModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        devices={devices}
        selectedAudioId={selectedAudioId}
        selectedVideoId={selectedVideoId}
        onSelectAudioDevice={switchAudioDevice}
        onSelectVideoDevice={switchVideoDevice}
      />

      {/* Permission Requests — only the host can receive/answer these */}
      {isHost && pendingScreenShareRequest && (
        <ScreenShareRequestModal
          requesterName={pendingScreenShareRequest.requesterName}
          onApprove={() =>
            respondToScreenShareRequest(pendingScreenShareRequest.requesterSocketId, true)
          }
          onDeny={() =>
            respondToScreenShareRequest(pendingScreenShareRequest.requesterSocketId, false)
          }
        />
      )}

      {isHost && pendingWhiteboardRequest && (
        <WhiteboardRequestModal
          requesterName={pendingWhiteboardRequest.requesterName}
          onApprove={() =>
            respondToWhiteboardRequest(pendingWhiteboardRequest.requesterSocketId, true)
          }
          onDeny={() =>
            respondToWhiteboardRequest(pendingWhiteboardRequest.requesterSocketId, false)
          }
        />
      )}

      {/* Host Modals */}
      <RemoveParticipantModal
        isOpen={!!targetRemoveParticipant}
        participant={targetRemoveParticipant}
        onClose={() => setTargetRemoveParticipant(null)}
        onConfirmRemove={(pId) => removeParticipant(pId)}
      />

      <EndMeetingModal
        isOpen={isEndMeetingModalOpen}
        onClose={() => setIsEndMeetingModalOpen(false)}
        onConfirmEnd={() => {
          endMeetingForEveryone(() => navigate('/ended'));
        }}
      />

      {/* Leave Meeting (Leaves session while meeting continues for others) */}
      <LeaveMeetingModal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        onConfirmLeave={() => {
          leaveMeeting();
          navigate('/');
        }}
      />
    </div>
  );
};