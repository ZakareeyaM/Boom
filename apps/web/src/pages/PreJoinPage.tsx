import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Copy,
  Check,
  Settings,
  AlertTriangle,
  User as UserIcon,
  RotateCw,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Avatar } from '../components/common/Avatar';
import { Navbar } from '../components/layout/Navbar';
import { DeviceSelectorModal } from '../components/meeting/DeviceSelectorModal';
import { useMediaStream } from '../hooks/useMediaStream';
import { useAudioMeter } from '../hooks/useAudioMeter';
import { fetchApi } from '../utils/api';
import type { Meeting } from '@boom/types';

export const PreJoinPage: React.FC = () => {
  const { meetingCode } = useParams<{ meetingCode: string }>();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(() => localStorage.getItem('boom_display_name') || '');
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);

  // Local media hook
  const {
    stream,
    audioEnabled,
    videoEnabled,
    isLoading: isMediaLoading,
    error: mediaError,
    devices,
    selectedAudioId,
    selectedVideoId,
    toggleAudio,
    toggleVideo,
    switchAudioDevice,
    switchVideoDevice,
    retryPermissions,
  } = useMediaStream(true, true);

  const { volume, isSpeaking } = useAudioMeter(stream, !audioEnabled);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  // Attach local stream to preview element
  useEffect(() => {
    if (videoPreviewRef.current && stream) {
      videoPreviewRef.current.srcObject = stream;
    }
  }, [stream]);

  // Verify meeting validity before joining
  useEffect(() => {
    async function verifyMeeting() {
      if (!meetingCode) {
        setVerifyError('Invalid meeting link.');
        setIsVerifying(false);
        return;
      }

      try {
        const res = await fetchApi<{ meeting: Meeting }>(`/api/meetings/code/${meetingCode}`);
        setMeeting(res.meeting);
      } catch (err: any) {
        setVerifyError(err.message || 'Meeting not found or has ended.');
      } finally {
        setIsVerifying(false);
      }
    }

    verifyMeeting();
  }, [meetingCode]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = () => {
    const finalName = displayName.trim() || 'Guest';
    if (finalName !== 'Guest') localStorage.setItem('boom_display_name', finalName);
    navigate(`/meeting/${meetingCode}`, {
      state: {
        displayName: finalName,
        audioEnabled,
        videoEnabled,
      },
    });
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-dark-bg flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-3">
          <RotateCw className="w-8 h-8 animate-spin text-brand-400" />
          <p className="text-sm font-medium">Connecting to meeting...</p>
        </div>
      </div>
    );
  }

  if (verifyError) {
    return (
      <div className="min-h-screen bg-dark-bg flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white">Cannot Join Meeting</h2>
          <p className="text-sm text-slate-400 leading-relaxed">{verifyError}</p>
          <Button variant="primary" onClick={() => navigate('/')}>
            Return to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 md:py-12 flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12">
        {/* Left Column: Camera Preview & Media Controls */}
        <div className="w-full lg:w-3/5 space-y-4">
          {/* Video Preview Card */}
          <div className="relative aspect-video w-full rounded-2xl bg-dark-card border border-dark-border overflow-hidden shadow-2xl flex items-center justify-center">
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${
                videoEnabled && stream ? 'opacity-100' : 'opacity-0 absolute'
              }`}
            />

            {/* Camera Off Placeholder */}
            {(!videoEnabled || !stream) && (
              <div className="flex flex-col items-center justify-center p-6 space-y-3">
                <Avatar
                  name={displayName || 'You'}
                  size="2xl"
                  isSpeaking={isSpeaking}
                />
                <p className="text-sm font-medium text-slate-400">Camera is off</p>
              </div>
            )}

            {/* Permission Denied Warning Overlay */}
            {mediaError && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm p-6 flex flex-col items-center justify-center text-center space-y-3 z-20">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
                <h4 className="text-sm font-bold text-white">Media Permissions Required</h4>
                <p className="text-xs text-slate-300 max-w-xs leading-relaxed">{mediaError.message}</p>
                <Button variant="secondary" size="sm" onClick={retryPermissions}>
                  Try Again
                </Button>
              </div>
            )}

            {/* Audio Level Visualizer Bar */}
            {audioEnabled && (
              <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 z-10">
                <Mic className={`w-3.5 h-3.5 ${isSpeaking ? 'text-emerald-400' : 'text-slate-400'}`} />
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-75"
                    style={{ width: `${Math.min(100, volume * 1.5)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Media Toggle Controls */}
          <div className="flex items-center justify-center gap-3">
            <Button
              variant={audioEnabled ? 'secondary' : 'danger'}
              size="icon"
              onClick={toggleAudio}
              aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
              title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
            >
              {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </Button>

            <Button
              variant={videoEnabled ? 'secondary' : 'danger'}
              size="icon"
              onClick={toggleVideo}
              aria-label={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
              title={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
            >
              {videoEnabled ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </Button>

            <Button
              variant="secondary"
              size="icon"
              onClick={() => setIsDeviceModalOpen(true)}
              aria-label="Device settings"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Right Column: Pre-Join Info & Actions */}
        <div className="w-full lg:w-2/5 space-y-6">
          <div>
            <span className="text-xs font-semibold tracking-wider text-brand-400 uppercase">
              Boom Meeting
            </span>
            <h1 className="text-3xl font-extrabold text-white mt-1">Ready to join?</h1>
            <p className="text-sm text-slate-400 mt-1">
              Enter your display name and configure your devices before entering.
            </p>
          </div>

          {/* Meeting ID & Copy Invite */}
          <div className="p-4 rounded-xl bg-dark-card border border-dark-border flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Meeting ID</p>
              <p className="text-sm font-mono font-bold text-slate-200 tracking-wider">
                {meeting?.meetingCode || meetingCode}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyLink}
              leftIcon={copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-brand-400" />}
            >
              {copied ? 'Copied' : 'Copy Link'}
            </Button>
          </div>

          {/* Display Name Input */}
          <div className="space-y-3">
            <Input
              label="Your Display Name"
              type="text"
              required
              value={displayName}
                onChange={(e) => {
                setDisplayName(e.target.value);
                if (e.target.value.trim()) localStorage.setItem('boom_display_name', e.target.value.trim());
              }}
              placeholder="e.g. Sarah Jenkins"
              leftIcon={<UserIcon className="w-4 h-4" />}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && displayName.trim()) handleJoin();
              }}
            />

            <Button
              variant="primary"
              size="lg"
              onClick={handleJoin}
              disabled={!displayName.trim()}
              className="w-full"
            >
              Join Meeting
            </Button>
          </div>
        </div>
      </main>

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
    </div>
  );
};
