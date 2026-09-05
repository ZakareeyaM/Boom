import React, { useState, useEffect, useCallback } from 'react';
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
import type {
  Participant,
  DrawLinePayload,
  EraseRectPayload,
  WhiteboardAsset,
  WhiteboardCursor,
  WhiteboardText,
  WhiteboardShape,
} from '@boom/types';

export const MeetingRoomPage: React.FC = () => {
  const meetingCode = window.location.pathname.split('/').pop() || '';
  const navigate = (window as any).history;
  const displayName = 'Guest';

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
  } = useMediaStream(true, true);

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

  const [whiteboardHistory, setWhiteboardHistory] = useState<
    DrawLinePayload[][]
  >([]);

  const [whiteboardAsset, setWhiteboardAsset] =
    useState<WhiteboardAsset | null>(null);

  const [whiteboardCursors, setWhiteboardCursors] = useState<
    Map<string, WhiteboardCursor>
  >(new Map());

  const [whiteboardTexts, setWhiteboardTexts] = useState<WhiteboardText[]>(
    []
  );

  const [whiteboardShapes, setWhiteboardShapes] = useState<WhiteboardShape[]>(
    []
  );

  const [whiteboardCanUndo, setWhiteboardCanUndo] = useState(false);
  const [whiteboardCanRedo, setWhiteboardCanRedo] = useState(false);

  // Modals State
  const [targetRemoveParticipant, setTargetRemoveParticipant] =
    useState<Participant | null>(null);

  const [isEndMeetingModalOpen, setIsEndMeetingModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);

  // Remote Whiteboard Draw Handlers
  const handleRemoteDraw = useCallback(
    (line: DrawLinePayload, senderId: string) => {
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
    },
    []
  );

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
    setWhiteboardHistory([]);
    setWhiteboardTexts([]);
    setWhiteboardShapes([]);
    setWhiteboardAsset(null);

    if (typeof (window as any).__boom_clearCanvas === 'function') {
      (window as any).__boom_clearCanvas();
    }
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

    // Whiteboard text functions
    sendWhiteboardText,
    sendWhiteboardTextUpdate,

    // FIX:
    // This function exists in useWebRTC.ts and must be destructured here.
    sendWhiteboardTextDelete,

    // Whiteboard shape functions
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

    onKicked: () => {
      window.location.href = '/removed';
    },

    onMeetingEnded: () => {
      window.location.href = '/ended';
    },

    onHostMediaDisabled: (media) => {
      if (media === 'video') {
        setVideoState(false);
      } else {
        setAudioState(false);
      }
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

    onWhiteboardSnapshot: (
      history,
      asset,
      texts,
      shapes
    ) => {
      setWhiteboardHistory(history);
      setWhiteboardAsset(asset);
      setWhiteboardTexts(texts);
      setWhiteboardShapes(shapes || []);
    },

    onWhiteboardText: (text) => {
      setWhiteboardTexts((prev) => [
        ...prev.filter((t) => t.id !== text.id),
        text,
      ]);
    },

    onWhiteboardTextUpdate: (text) => {
      setWhiteboardTexts((prev) =>
        prev.map((t) => (t.id === text.id ? text : t))
      );
    },

    onWhiteboardTextDelete: (textId) => {
      setWhiteboardTexts((prev) =>
        prev.filter((t) => t.id !== textId)
      );
    },

    onWhiteboardHistoryState: ({ canUndo, canRedo }) => {
      setWhiteboardCanUndo(canUndo);
      setWhiteboardCanRedo(canRedo);
    },

    onWhiteboardShape: (shape) => {
      setWhiteboardShapes((prev) => [
        ...prev.filter((s) => s.id !== shape.id),
        shape,
      ]);
    },

    onWhiteboardShapeDelete: (shapeId) => {
      setWhiteboardShapes((prev) =>
        prev.filter((s) => s.id !== shapeId)
      );
    },

    onWhiteboardAsset: (asset) => {
      setWhiteboardAsset(asset);
    },

    onWhiteboardCursor: (cursor) => {
      setWhiteboardCursors((prev) => {
        const next = new Map(prev);

        if (cursor.visible) {
          next.set(cursor.participantId, cursor);
        } else {
          next.delete(cursor.participantId);
        }

        return next;
      });
    },

    onScreenShareForceStop: () => {
      stopScreenShare();
    },
  });

  const isHost = localParticipant?.isHost || false;

  const canEditWhiteboard =
    isHost || whiteboardPermission === 'granted';

  // Track unread messages
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

      const incoming = newMessages.some(
        (message) =>
          message.senderId !== localParticipant?.id
      );

      if (!isChatOpen && incoming) {
        setUnreadCount(
          (prev) =>
            prev +
            newMessages.filter(
              (m) =>
                m.senderId !== localParticipant?.id
            ).length
        );

        setChatAlert(true);
      }
    }

    prevMessagesCount.current = messages.length;
  }, [
    messages,
    isChatOpen,
    localParticipant?.id,
  ]);

  const handleToggleChat = () => {
    setIsChatOpen((prev) => {
      if (!prev) {
        setUnreadCount(0);
        setChatAlert(false);
      }

      return !prev;
    });

    if (isParticipantsOpen) {
      setIsParticipantsOpen(false);
    }
  };

  const handleToggleParticipants = () => {
    setIsParticipantsOpen((prev) => !prev);

    if (isChatOpen) {
      setIsChatOpen(false);
    }
  };

  const handleToggleScreenShare = async () => {
    if (isSharingScreen) {
      stopScreenShare();
      broadcastScreenShareStop();
      return;
    }

    if (
      !isHost &&
      screenSharePermission !== 'granted'
    ) {
      if (screenSharePermission !== 'pending') {
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

  // Connecting
  if (meetingState === 'CONNECTING') {
    return (
      <div className="h-screen w-screen bg-dark-bg flex flex-col items-center justify-center text-slate-400 space-y-3">
        <RotateCw className="w-8 h-8 animate-spin text-brand-500" />

        <p className="text-sm font-medium">
          Entering meeting room...
        </p>
      </div>
    );
  }

  // Error
  if (meetingState === 'ERROR') {
    return (
      <div className="h-screen w-screen bg-dark-bg flex flex-col items-center justify-center p-4 text-center max-w-md mx-auto space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <h2 className="text-2xl font-bold text-white">
          Meeting Unavailable
        </h2>

        <p className="text-sm text-slate-400 leading-relaxed">
          {errorMessage}
        </p>

        <Button
          variant="primary"
          onClick={() => {
            window.location.href = '/';
          }}
        >
          Return to Home
        </Button>
      </div>
    );
  }

  const remoteParticipants = participants.filter(
    (p) => p.id !== localParticipant?.id
  );

  return (
    <div className="h-screen w-screen bg-dark-bg text-slate-100 flex flex-col overflow-hidden relative select-none">

      {/* Main Stage */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden">

        {/* Reconnecting */}
        {meetingState === 'RECONNECTING' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500/90 text-black px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 shadow-xl animate-pulse">
            <RotateCw className="w-3.5 h-3.5 animate-spin" />

            Connection lost. Reconnecting...
          </div>
        )}

        {/* WHITEBOARD */}
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

            onClear={() => {
              setWhiteboardHistory([]);
              setWhiteboardTexts([]);
              setWhiteboardShapes([]);
              setWhiteboardAsset(null);

              sendWhiteboardClear();
            }}

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

            onTextDelete={(textId) => {
              // Immediately remove locally
              setWhiteboardTexts((prev) =>
                prev.filter(
                  (t) => t.id !== textId
                )
              );

              // Tell all other participants
              sendWhiteboardTextDelete(textId);
            }}

            onShape={sendWhiteboardShape}

            onShapeUpdate={(shape) => {
              setWhiteboardShapes((prev) =>
                prev.map((s) =>
                  s.id === shape.id
                    ? shape
                    : s
                )
              );

              sendWhiteboardShapeUpdate(shape);
            }}

            onShapeDelete={sendWhiteboardShapeDelete}

            onCursor={sendWhiteboardCursor}

            onAsset={sendWhiteboardAsset}

            onClose={() =>
              toggleWhiteboard(false)
            }
          />
        ) : screenSharer || isSharingScreen ? (
          /* SCREEN SHARE */
          <ScreenShareStage
            sharerName={
              screenSharer?.name ||
              displayName
            }

            isLocalSharer={
              isSharingScreen
            }

            screenStream={
              isSharingScreen
                ? screenStream
                : remoteStreams.get(
                    screenSharer?.id || ''
                  ) || null
            }

            onStopSharing={() => {
              stopScreenShare();
              broadcastScreenShareStop();
            }}
          />
        ) : (
          /* VIDEO GRID */
          localParticipant && (
            <VideoGrid
              localParticipant={localParticipant}
              localStream={localStream}
              remoteParticipants={
                remoteParticipants
              }
              remoteStreams={remoteStreams}
              connectionQuality={
                connectionQuality
              }
              showVideos={showVideoGrid}
              onToggleVideos={() =>
                setShowVideoGrid(
                  (prev) => !prev
                )
              }
            />
          )
        )}
      </div>

      {/* CONTROL BAR */}
      <ControlBar
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        isSharingScreen={isSharingScreen}
        isWhiteboardOpen={
          whiteboardState.isOpen
        }
        participantCount={
          participants.length
        }
        unreadCount={unreadCount}
        chatAlert={chatAlert}
        isChatOpen={isChatOpen}
        isParticipantsOpen={
          isParticipantsOpen
        }
        isHost={isHost}
        screenSharePermission={
          screenSharePermission
        }

        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={
          handleToggleScreenShare
        }
        onToggleWhiteboard={
          handleToggleWhiteboard
        }
        onToggleChat={
          handleToggleChat
        }
        onToggleParticipants={
          handleToggleParticipants
        }
        onOpenDeviceSettings={() =>
          setIsDeviceModalOpen(true)
        }
        onLeaveMeeting={() =>
          setIsLeaveModalOpen(true)
        }
        onEndMeeting={() =>
          setIsEndMeetingModalOpen(true)
        }
      />

      {/* CHAT */}
      <ChatDrawer
        isOpen={isChatOpen}
        onClose={() =>
          setIsChatOpen(false)
        }
        messages={messages}
        currentUserId={
          localParticipant?.id || ''
        }
        onSendMessage={sendMessage}
      />

      {/* PARTICIPANTS */}
      <ParticipantsDrawer
        isOpen={isParticipantsOpen}
        onClose={() =>
          setIsParticipantsOpen(false)
        }
        participants={participants}
        currentUserId={
          localParticipant?.id || ''
        }
        isHost={isHost}
        meetingCode={meetingCode}
        onMuteParticipant={
          muteParticipant
        }
        onRevokeScreenShare={
          revokeScreenShare
        }
        onRevokeWhiteboardAccess={
          revokeWhiteboardAccess
        }
        onRequestRemoveParticipant={(
          participant
        ) =>
          setTargetRemoveParticipant(
            participant
          )
        }
      />

      {/* DEVICE SETTINGS */}
      <DeviceSelectorModal
        isOpen={isDeviceModalOpen}
        onClose={() =>
          setIsDeviceModalOpen(false)
        }
        devices={devices}
        selectedAudioId={
          selectedAudioId
        }
        selectedVideoId={
          selectedVideoId
        }
        onSelectAudioDevice={
          switchAudioDevice
        }
        onSelectVideoDevice={
          switchVideoDevice
        }
      />

      {/* SCREEN SHARE REQUEST */}
      {isHost &&
        pendingScreenShareRequest && (
          <ScreenShareRequestModal
            requesterName={
              pendingScreenShareRequest.requesterName
            }
            onApprove={() =>
              respondToScreenShareRequest(
                pendingScreenShareRequest.requesterSocketId,
                true
              )
            }
            onDeny={() =>
              respondToScreenShareRequest(
                pendingScreenShareRequest.requesterSocketId,
                false
              )
            }
          />
        )}

      {/* WHITEBOARD REQUEST */}
      {isHost &&
        pendingWhiteboardRequest && (
          <WhiteboardRequestModal
            requesterName={
              pendingWhiteboardRequest.requesterName
            }
            onApprove={() =>
              respondToWhiteboardRequest(
                pendingWhiteboardRequest.requesterSocketId,
                true
              )
            }
            onDeny={() =>
              respondToWhiteboardRequest(
                pendingWhiteboardRequest.requesterSocketId,
                false
              )
            }
          />
        )}

      {/* REMOVE PARTICIPANT */}
      <RemoveParticipantModal
        isOpen={
          !!targetRemoveParticipant
        }
        participant={
          targetRemoveParticipant
        }
        onClose={() =>
          setTargetRemoveParticipant(
            null
          )
        }
        onConfirmRemove={(participantId) =>
          removeParticipant(participantId)
        }
      />

      {/* END MEETING */}
      <EndMeetingModal
        isOpen={
          isEndMeetingModalOpen
        }
        onClose={() =>
          setIsEndMeetingModalOpen(false)
        }
        onConfirmEnd={() => {
          endMeetingForEveryone(() => {
            window.location.href =
              '/ended';
          });
        }}
      />

      {/* LEAVE MEETING */}
      <LeaveMeetingModal
        isOpen={isLeaveModalOpen}
        onClose={() =>
          setIsLeaveModalOpen(false)
        }
        onConfirmLeave={() => {
          leaveMeeting();
          window.location.href = '/';
        }}
      />
    </div>
  );
};