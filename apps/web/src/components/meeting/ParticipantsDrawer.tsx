import React from 'react';
import { X, Mic, MicOff, Video as VideoIcon, VideoOff, Crown, UserX, Copy, Check, VolumeX, MonitorOff, PenOff } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { Button } from '../common/Button';
import type { Participant } from '@boom/types';

interface ParticipantsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  participants: Participant[];
  currentUserId: string;
  isHost: boolean;
  meetingCode: string;
  onMuteParticipant: (id: string, media?: 'audio' | 'video') => void;
  onRequestRemoveParticipant: (participant: Participant) => void;
  onRevokeScreenShare: (id: string) => void;
  onRevokeWhiteboardAccess: (id: string) => void;
}

export const ParticipantsDrawer: React.FC<ParticipantsDrawerProps> = ({
  isOpen,
  onClose,
  participants,
  currentUserId,
  isHost,
  meetingCode,
  onMuteParticipant,
  onRequestRemoveParticipant,
  onRevokeScreenShare,
  onRevokeWhiteboardAccess,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    const url = `${window.location.origin}/join/${meetingCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-dark-surface border-l border-dark-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
        <h3 className="font-semibold text-slate-100">
          Participants ({participants.length})
        </h3>
        <button
          onClick={onClose}
          aria-label="Close participants list"
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-dark-card transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Copy Invite Link Quick Button */}
      <div className="p-3 border-b border-dark-border bg-dark-bg/40">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          leftIcon={copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-brand-400" />}
          className="w-full text-xs"
        >
          {copied ? 'Invite Link Copied!' : 'Copy Meeting Invite Link'}
        </Button>
      </div>

      {/* Roster List */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2">
        {participants.map((p) => {
          const isMe = p.id === currentUserId;
          return (
            <div
              key={p.id}
              className="p-3 rounded-xl bg-dark-card border border-dark-border flex items-center justify-between gap-3 group hover:border-slate-700 transition-colors"
            >
              {/* Avatar & Name */}
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={p.displayName} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-200 truncate">
                      {p.displayName}
                    </span>
                    {isMe && <span className="text-xs text-slate-400">(You)</span>}
                  </div>
                  {p.isHost && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                      <Crown className="w-2.5 h-2.5" /> Host
                    </span>
                  )}
                </div>
              </div>

              {/* Status Icons & Host Actions */}
              <div className="flex items-center gap-2">
                {/* Audio Status */}
                <div
                  className={`p-1.5 rounded-lg text-xs ${
                    p.audioEnabled ? 'text-slate-400' : 'text-rose-400 bg-rose-500/10'
                  }`}
                  title={p.audioEnabled ? 'Mic active' : 'Mic muted'}
                >
                  {p.audioEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                </div>

                {/* Video Status */}
                <div
                  className={`p-1.5 rounded-lg text-xs ${
                    p.videoEnabled ? 'text-slate-400' : 'text-rose-400 bg-rose-500/10'
                  }`}
                  title={p.videoEnabled ? 'Camera on' : 'Camera off'}
                >
                  {p.videoEnabled ? (
                    <VideoIcon className="w-3.5 h-3.5" />
                  ) : (
                    <VideoOff className="w-3.5 h-3.5" />
                  )}
                </div>

                {/* Host Controls */}
                {isHost && !isMe && (
                  <div className="flex items-center gap-1 ml-1 pl-1 border-l border-dark-border">
                    {p.audioEnabled && (
                      <button
                        onClick={() => onMuteParticipant(p.id, 'audio')}
                        title="Mute Participant"
                        aria-label={`Mute ${p.displayName}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                      >
                        <VolumeX className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {p.videoEnabled && (
                      <button
                        onClick={() => onMuteParticipant(p.id, 'video')}
                        title="Disable Participant Camera"
                        aria-label={`Disable camera for ${p.displayName}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                      >
                        <VideoOff className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => onRevokeScreenShare(p.id)} title={`Stop screen sharing permission for ${p.displayName}`} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"><MonitorOff className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onRevokeWhiteboardAccess(p.id)} title={`Stop whiteboard access for ${p.displayName}`} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"><PenOff className="w-3.5 h-3.5" /></button>
                    <button
                      onClick={() => onRequestRemoveParticipant(p)}
                      title="Remove Participant"
                      aria-label={`Remove ${p.displayName}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
