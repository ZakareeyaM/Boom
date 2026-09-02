import React, { useEffect, useRef } from 'react';
import { ScreenShare, StopCircle, RotateCw } from 'lucide-react';
import { Button } from '../common/Button';
import { ParticipantTile } from './ParticipantTile';
import type { Participant, ConnectionQuality } from '@boom/types';

interface ScreenShareStageProps {
  sharerName: string;
  isLocalSharer: boolean;
  screenStream: MediaStream | null;
  localParticipant: Participant;
  localStream: MediaStream | null;
  remoteParticipants: Participant[];
  remoteStreams: Map<string, MediaStream>;
  connectionQuality: ConnectionQuality;
  onStopSharing: () => void;
}

export const ScreenShareStage: React.FC<ScreenShareStageProps> = ({
  sharerName,
  isLocalSharer,
  screenStream,
  localParticipant,
  localStream,
  remoteParticipants,
  remoteStreams,
  connectionQuality,
  onStopSharing,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video && screenStream) {
      video.srcObject = screenStream;
      video.play().catch(() => {});
    }
  }, [screenStream]);

  return (
    <div className="w-full h-full flex flex-col p-2 sm:p-4 gap-3 overflow-hidden">
      {/* Top Notification Banner */}
      <div className="flex items-center justify-between px-4 py-2 bg-dark-card border border-dark-border rounded-xl text-xs sm:text-sm font-medium text-slate-200">
        <div className="flex items-center gap-2">
          <ScreenShare className="w-4 h-4 text-brand-400" />
          <span>
            {isLocalSharer ? 'You are sharing your screen' : `${sharerName} is sharing their screen`}
          </span>
        </div>
        {isLocalSharer && (
          <Button
            variant="danger"
            size="sm"
            onClick={onStopSharing}
            leftIcon={<StopCircle className="w-4 h-4" />}
            className="py-1 px-3 text-xs"
          >
            Stop Sharing
          </Button>
        )}
      </div>

      {/* Main Content Area: Big Screen Share + Mini Tiles Strip */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 overflow-hidden">
        {/* Large Screen Presentation Stage */}
        <div className="flex-1 bg-black rounded-2xl border border-dark-border overflow-hidden relative flex items-center justify-center">
          {screenStream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isLocalSharer}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 space-y-3 p-6">
              <RotateCw className="w-8 h-8 animate-spin text-brand-400" />
              <p className="text-sm font-medium">Receiving screen share from {sharerName}...</p>
            </div>
          )}
        </div>

        {/* Video Strip (Right on large screens, Bottom on small screens) */}
        <div className="lg:w-64 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto min-h-[120px] lg:min-h-0">
          {/* Local participant mini tile */}
          <div className="w-44 lg:w-full aspect-video shrink-0">
            <ParticipantTile
              participant={localParticipant}
              stream={localStream}
              isLocal={true}
              connectionQuality={connectionQuality}
            />
          </div>

          {/* Remote participants mini tiles */}
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
      </div>
    </div>
  );
};
