import React from 'react';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  ScreenShare,
  Presentation,
  Users,
  MessageSquare,
  PhoneOff,
  LogOut,
  Settings,
  ChevronUp,
} from 'lucide-react';

interface ControlBarProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSharingScreen: boolean;
  isWhiteboardOpen: boolean;
  participantCount: number;
  unreadCount: number;
  chatAlert?: boolean;
  sessionTime: string;
  isChatOpen: boolean;
  isParticipantsOpen: boolean;
  isHost: boolean;
  screenSharePermission: 'idle' | 'pending' | 'granted' | 'denied';
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleWhiteboard: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onOpenDeviceSettings: () => void;
  onLeaveMeeting: () => void;
  onEndMeeting: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  audioEnabled,
  videoEnabled,
  isSharingScreen,
  isWhiteboardOpen,
  participantCount,
  unreadCount,
  chatAlert = false,
  sessionTime,
  isChatOpen,
  isParticipantsOpen,
  isHost,
  screenSharePermission,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleWhiteboard,
  onToggleChat,
  onToggleParticipants,
  onOpenDeviceSettings,
  onLeaveMeeting,
  onEndMeeting,
}) => {
  return (
    <div className="w-full bg-dark-surface/90 backdrop-blur-md border-t border-dark-border px-4 py-3 sm:py-3.5 flex items-center justify-between z-30 select-none">
      {/* Left: Meeting Branding / Status Indicator */}
      <div className="hidden md:flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        Boom Live
      </div>

      {/* Center: Core Meeting Controls */}
      <div className="flex items-center gap-2 sm:gap-3 mx-auto">
        {/* Microphone Button */}
        <div className="flex items-center rounded-xl bg-dark-card border border-dark-border overflow-hidden">
          <button
            onClick={onToggleAudio}
            aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
            title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
            className={`p-3 transition-colors flex items-center justify-center ${
              audioEnabled
                ? 'text-slate-200 hover:text-white hover:bg-white/10'
                : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
            }`}
          >
            {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <button
            onClick={onOpenDeviceSettings}
            aria-label="Audio device options"
            title="Audio options"
            className="p-3 text-slate-400 hover:text-slate-200 hover:bg-white/10 border-l border-dark-border"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Camera Button */}
        <div className="flex items-center rounded-xl bg-dark-card border border-dark-border overflow-hidden">
          <button
            onClick={onToggleVideo}
            aria-label={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
            title={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
            className={`p-3 transition-colors flex items-center justify-center ${
              videoEnabled
                ? 'text-slate-200 hover:text-white hover:bg-white/10'
                : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
            }`}
          >
            {videoEnabled ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
          <button
            onClick={onOpenDeviceSettings}
            aria-label="Video device options"
            title="Video options"
            className="p-3 text-slate-400 hover:text-slate-200 hover:bg-white/10 border-l border-dark-border"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Screen Share Button */}
        <button
          onClick={onToggleScreenShare}
          aria-label={
            isSharingScreen
              ? 'Stop sharing screen'
              : isHost
                ? 'Share screen'
                : screenSharePermission === 'pending'
                  ? 'Waiting for host approval'
                  : screenSharePermission === 'granted'
                    ? 'Share screen (approved)'
                    : 'Request permission to share screen'
          }
          title={
            isSharingScreen
              ? 'Stop sharing screen'
              : isHost
                ? 'Share screen'
                : screenSharePermission === 'pending'
                  ? 'Waiting for host approval'
                  : screenSharePermission === 'granted'
                    ? 'Host approved screen sharing'
                    : 'Request permission to share screen'
          }
          className={`p-3 rounded-xl border transition-all flex items-center justify-center ${
            isSharingScreen
              ? 'bg-brand-600 text-white border-brand-500 shadow-lg shadow-brand-500/30'
              : !isHost && screenSharePermission === 'pending'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : !isHost && screenSharePermission === 'granted'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-dark-card text-slate-300 hover:text-white hover:bg-dark-hover border-dark-border'
          }`}
        >
          <ScreenShare className="w-5 h-5" />
        </button>

        {/* Whiteboard Button */}
        <button
          onClick={onToggleWhiteboard}
          aria-label={isWhiteboardOpen ? 'Close whiteboard' : 'Open whiteboard'}
          title={isWhiteboardOpen ? 'Close whiteboard' : 'Whiteboard'}
          className={`p-3 rounded-xl border transition-all flex items-center justify-center ${
            isWhiteboardOpen
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-500/30'
              : 'bg-dark-card text-slate-300 hover:text-white hover:bg-dark-hover border-dark-border'
          }`}
        >
          <Presentation className="w-5 h-5" />
        </button>

        {/* Participants Panel Toggle */}
        <button
          onClick={onToggleParticipants}
          aria-label="Participants list"
          title="Participants"
          className={`relative p-3 rounded-xl border transition-all flex items-center justify-center ${
            isParticipantsOpen
              ? 'bg-brand-600/20 text-brand-400 border-brand-500/40'
              : 'bg-dark-card text-slate-300 hover:text-white hover:bg-dark-hover border-dark-border'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700">
            {participantCount}
          </span>
        </button>

        {/* Chat Panel Toggle */}
        <button
          onClick={onToggleChat}
          aria-label="Meeting chat"
          title="Chat"
          className={`relative p-3 rounded-xl border transition-all flex items-center justify-center ${
            isChatOpen
              ? 'bg-brand-600/20 text-brand-400 border-brand-500/40'
              : 'bg-dark-card text-slate-300 hover:text-white hover:bg-dark-hover border-dark-border'
          }`}
        >
          <MessageSquare className={`w-5 h-5 ${chatAlert && !isChatOpen ? 'animate-pulse' : ''}`} />
          {unreadCount > 0 && (
            <span className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-brand-500 text-white text-[10px] font-bold shadow-md ${chatAlert && !isChatOpen ? 'animate-bounce' : ''}`}>
              {unreadCount}
            </span>
          )}
        </button>

        <div
          className="flex items-center gap-2 h-[46px] px-2.5 sm:px-3 rounded-xl bg-dark-card border border-dark-border"
          aria-label={`Session duration ${sessionTime}`}
          title={`Session duration: ${sessionTime}`}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
          <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wider text-slate-400">Session</span>
          <span className="font-mono text-sm font-bold tabular-nums text-slate-100">{sessionTime}</span>
        </div>
      </div>

      {/* Right: Leave / End Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenDeviceSettings}
          title="Device Settings"
          aria-label="Device Settings"
          className="hidden sm:flex p-3 rounded-xl bg-dark-card hover:bg-dark-hover text-slate-400 hover:text-white border border-dark-border transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>

        {isHost ? (
          <div className="flex items-center gap-2">
            {/* Host can Leave without ending call */}
            <button
              onClick={onLeaveMeeting}
              aria-label="Leave meeting"
              title="Leave meeting (call will continue for others)"
              className="px-3.5 py-2.5 rounded-xl bg-dark-card hover:bg-dark-hover text-slate-300 hover:text-white border border-dark-border font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-all active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Leave</span>
            </button>

            {/* Host can End meeting for everyone */}
            <button
              onClick={onEndMeeting}
              aria-label="End meeting for everyone"
              title="End meeting for all participants"
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 shadow-lg shadow-rose-600/25 transition-all active:scale-95"
            >
              <PhoneOff className="w-4 h-4" />
              <span>End All</span>
            </button>
          </div>
        ) : (
          /* Normal participant simply leaves */
          <button
            onClick={onLeaveMeeting}
            aria-label="Leave meeting"
            title="Leave Meeting"
            className="px-4 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 hover:border-rose-500 font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-all active:scale-95"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Leave</span>
          </button>
        )}
      </div>
    </div>
  );
};
