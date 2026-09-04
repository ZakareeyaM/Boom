import React, { useEffect, useRef } from 'react';
import { ScreenShare, StopCircle, RotateCw } from 'lucide-react';
import { Button } from '../common/Button';

interface ScreenShareStageProps {
  sharerName: string;
  isLocalSharer: boolean;
  screenStream: MediaStream | null;
  onStopSharing: () => void;
}

/**
 * Presentation mode intentionally uses the entire available stage for the
 * shared screen. Participant camera tiles are hidden while a screen is being
 * presented so the audience sees the presentation rather than a webcam grid.
 */
export const ScreenShareStage: React.FC<ScreenShareStageProps> = ({
  sharerName,
  isLocalSharer,
  screenStream,
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
      <div className="flex items-center justify-between px-4 py-2 bg-dark-card border border-dark-border rounded-xl text-xs sm:text-sm font-medium text-slate-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ScreenShare className="w-4 h-4 text-brand-400 shrink-0" />
          <span className="truncate">
            {isLocalSharer ? 'You are sharing your screen' : `${sharerName} is sharing their screen`}
          </span>
        </div>
        {isLocalSharer && (
          <Button
            variant="danger"
            size="sm"
            onClick={onStopSharing}
            leftIcon={<StopCircle className="w-4 h-4" />}
            className="py-1 px-3 text-xs shrink-0"
          >
            Stop Sharing
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 bg-black rounded-2xl border border-dark-border overflow-hidden relative flex items-center justify-center shadow-2xl">
        {screenStream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocalSharer}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-400 space-y-3 p-6 text-center">
            <RotateCw className="w-8 h-8 animate-spin text-brand-400" />
            <p className="text-sm font-medium">Receiving screen share from {sharerName}...</p>
          </div>
        )}
      </div>
    </div>
  );
};
