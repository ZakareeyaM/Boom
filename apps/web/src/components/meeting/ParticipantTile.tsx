import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Crown, Wifi } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { useAudioMeter } from '../../hooks/useAudioMeter';
import type { Participant, ConnectionQuality } from '@boom/types';

interface ParticipantTileProps {
  participant: Participant;
  stream: MediaStream | null;
  isLocal?: boolean;
  connectionQuality?: ConnectionQuality;
  isScreenShare?: boolean;
}

export const ParticipantTile: React.FC<ParticipantTileProps> = ({
  participant,
  stream,
  isLocal = false,
  connectionQuality = 'EXCELLENT',
  isScreenShare = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { isSpeaking } = useAudioMeter(stream, !participant.audioEnabled);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
    }

    // Keep remote voice audio on a dedicated <audio> element instead of
    // routing it through the video element. This avoids browser-specific
    // video/audio autoplay and track-mixing issues. The local tile stays
    // silent to prevent echo.
    if (audioRef.current) {
      const audio = audioRef.current;
      audio.srcObject = isLocal ? null : stream;
      audio.muted = isLocal || !participant.audioEnabled;
      // Never allow a stale playback rate/volume to survive a stream swap.
      // A normal WebRTC voice stream must play at real time and at one copy.
      audio.playbackRate = 1;
      audio.defaultPlaybackRate = 1;
      audio.volume = 1;

      if (!isLocal && stream && participant.audioEnabled) {
        void audio.play().catch(() => {
          // Browser autoplay policy may require a user gesture. The element
          // remains attached and will play after the next allowed interaction.
        });
      }
    }
  }, [stream, isLocal, participant.audioEnabled]);

  const qualityColors = {
    EXCELLENT: 'text-emerald-400',
    UNSTABLE: 'text-amber-400',
    POOR: 'text-rose-400',
  };

  return (
    <div
      className={`relative w-full h-full min-h-[160px] rounded-2xl bg-dark-card border border-dark-border overflow-hidden flex items-center justify-center transition-all duration-200 group ${
        isSpeaking ? 'speaking-border' : ''
      }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={true} // Remote audio is played by the dedicated audio element below
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          participant.videoEnabled && stream ? 'opacity-100' : 'opacity-0 absolute'
        } ${isLocal && !isScreenShare ? 'scale-x-[-1]' : ''}`} // Mirror local camera preview
      />

      {/* Dedicated remote audio output. Keeping this separate from the video
          element makes remote microphone playback reliable across browsers. */}
      {!isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          controls={false}
          preload="auto" 
          className="hidden"
          aria-hidden="true"
        />
      )}

      {/* Camera Off Avatar Fallback */}
      {(!participant.videoEnabled || !stream) && (
        <div className="flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-200">
          <Avatar
            name={participant.displayName}
            size="xl"
            isSpeaking={isSpeaking}
          />
          <span className="mt-3 text-sm font-medium text-slate-300">
            {participant.displayName} {isLocal && '(You)'}
          </span>
        </div>
      )}

      {/* Top Left: Host Badge & Quality Indicator */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
        {participant.isHost && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold backdrop-blur-md">
            <Crown className="w-3 h-3" />
            Host
          </span>
        )}
        {!isLocal && (
          <div
            title={`Connection: ${connectionQuality}`}
            className="p-1 rounded-md bg-black/40 backdrop-blur-md text-xs"
          >
            <Wifi className={`w-3.5 h-3.5 ${qualityColors[connectionQuality]}`} />
          </div>
        )}
      </div>

      {/* Bottom Overlay: Participant Name & Mic Status */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-white text-xs font-medium border border-white/10 max-w-[80%] truncate">
          <span className="truncate">
            {participant.displayName} {isLocal && '(You)'}
          </span>
        </div>

        {/* Mic Indicator */}
        <div
          className={`p-1.5 rounded-lg backdrop-blur-md border ${
            participant.audioEnabled
              ? isSpeaking
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse'
                : 'bg-black/60 text-slate-300 border-white/10'
              : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
          }`}
          title={participant.audioEnabled ? 'Microphone On' : 'Microphone Muted'}
        >
          {participant.audioEnabled ? (
            <Mic className="w-3.5 h-3.5" />
          ) : (
            <MicOff className="w-3.5 h-3.5" />
          )}
        </div>
      </div>
    </div>
  );
};
