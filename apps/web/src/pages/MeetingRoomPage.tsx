import React, { useState, useEffect, useCallback } from 'react';
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
import { useMediaStream } from '../hooks/useMediaStream';
import { useScreenShare } from '../hooks/useScreenShare';
import { useWebRTC } from '../hooks/useWebRTC';
import type { Participant, DrawLinePayload } from '@boom/types';

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
    toggleVideo,
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
  });

  // UI State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Modals State
  const [targetRemoveParticipant, setTargetRemoveParticipant] = useState<Participant | null>(null);
  const [isEndMeetingModalOpen, setIsEndMeetingModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);

  // Remote Whiteboard Draw Handlers
  const handleRemoteDraw = useCallback((line: DrawLinePayload) => {
    if (typeof (window as any).__boom_drawSegment === 'function') {
      (window as any).__boom_drawSegment(
        line.prevX,
        line.prevY,
        line.currX,
        line.currY,
        line.color,
        line.size,
        line.isEraser
      );
    }
  }, []);

  const handleRemoteClear = useCallback(() => {
    if (typeof (window as any).__boom_clearCanvas === 'function') {
      (window as any).__boom_clearCanvas();
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
    toggleWhiteboard,
    sendWhiteboardDraw,
    sendWhiteboardClear,
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
    onWhiteboardDraw: handleRemoteDraw,
    onWhiteboardClear: handleRemoteClear,
  });

  // Track unread messages when chat drawer is closed
  const prevMessagesCount = React.useRef(messages.length);
  useEffect(() => {
    if (!isChatOpen && messages.length > prevMessagesCount.current) {
      setUnreadCount((prev) => prev + (messages.length - prevMessagesCount.current));
    }
    prevMessagesCount.current = messages.length;
  }, [messages, isChatOpen]);

  const handleToggleChat = () => {
    setIsChatOpen((prev) => {
      if (!prev) setUnreadCount(0);
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
    } else {
      const stream = await startScreenShare();
      if (stream) {
        broadcastScreenShareStart();
      }
    }
  };

  const handleToggleWhiteboard = () => {
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

  const isHost = localParticipant?.isHost || false;
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
            onDraw={sendWhiteboardDraw}
            onClear={sendWhiteboardClear}
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
            localParticipant={localParticipant!}
            localStream={localStream}
            remoteParticipants={remoteParticipants}
            remoteStreams={remoteStreams}
            connectionQuality={connectionQuality}
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
            />
          )
        )}
      </div>

      {/* Bottom Floating Control Bar */}
      <ControlBar
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        isSharingScreen={isSharingScreen}
        isWhiteboardOpen={whiteboardState.isOpen}
        participantCount={participants.length}
        unreadCount={unreadCount}
        isChatOpen={isChatOpen}
        isParticipantsOpen={isParticipantsOpen}
        isHost={isHost}
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