import React from 'react';
import { ParticipantTile } from './ParticipantTile';
import { PanelTopClose, PanelTopOpen } from 'lucide-react';
import type { Participant, ConnectionQuality } from '@boom/types';

interface VideoGridProps {
  localParticipant: Participant;
  localStream: MediaStream | null;
  remoteParticipants: Participant[];
  remoteStreams: Map<string, MediaStream>;
  connectionQuality: ConnectionQuality;
  showVideos: boolean;
  onToggleVideos: () => void;
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  localParticipant,
  localStream,
  remoteParticipants,
  remoteStreams,
  connectionQuality,
  showVideos,
  onToggleVideos,
}) => {
  const totalCount = 1 + remoteParticipants.length;

  // Compute CSS grid configuration based on participant count
  const getGridClasses = () => {
    if (totalCount === 1) {
      return 'grid-cols-1 max-w-4xl mx-auto h-full max-h-[85vh]';
    }
    if (totalCount === 2) {
      return 'grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto h-full max-h-[85vh]';
    }
    if (totalCount <= 4) {
      return 'grid-cols-1 sm:grid-cols-2 max-w-6xl mx-auto h-full max-h-[85vh]';
    }
    if (totalCount <= 6) {
      return 'grid-cols-2 md:grid-cols-3 max-w-7xl mx-auto h-full max-h-[85vh]';
    }
    return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 max-w-7xl mx-auto h-full overflow-y-auto';
  };

  return (
    <div className="relative w-full h-full p-3 sm:p-4 md:p-6 flex items-center justify-center overflow-hidden">
      <button
        onClick={onToggleVideos}
        title={showVideos ? 'Minimize video cameras' : 'Show video cameras'}
        aria-label={showVideos ? 'Minimize video cameras' : 'Show video cameras'}
        className="absolute top-4 right-4 z-20 p-2.5 rounded-xl bg-dark-card/90 hover:bg-dark-hover border border-dark-border text-slate-300 hover:text-white shadow-lg backdrop-blur-md transition-colors"
      >
        {showVideos ? <PanelTopClose className="w-4 h-4" /> : <PanelTopOpen className="w-4 h-4" />}
      </button>
      {showVideos ? (
      <div className={`grid gap-3 sm:gap-4 w-full items-center justify-center ${getGridClasses()}`}>
        {/* Local Participant Tile */}
        <div className="w-full h-full min-h-[180px] max-h-[420px] aspect-video">
          <ParticipantTile
            participant={localParticipant}
            stream={localStream}
            isLocal={true}
            connectionQuality={connectionQuality}
          />
        </div>

        {/* Remote Participants Tiles */}
        {remoteParticipants.map((p) => {
          const stream = remoteStreams.get(p.id) || null;
          return (
            <div
              key={p.id}
              className="w-full h-full min-h-[180px] max-h-[420px] aspect-video"
            >
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
      ) : (
        <div className="flex flex-col items-center justify-center text-center text-slate-400 gap-3">
          <PanelTopOpen className="w-8 h-8 text-brand-400" />
          <p className="text-sm font-medium">Video cameras minimized</p>
          <p className="text-xs text-slate-500">Click the button above to show them again.</p>
        </div>
      )}
    </div>
  );
};
