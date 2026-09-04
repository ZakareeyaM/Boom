import { useState, useRef, useCallback, useEffect } from 'react';

export function useScreenShare(onScreenShareEnded?: () => void, microphoneStream?: MediaStream | null) {
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mixedDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const stopScreenShare = useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    mixedDestinationRef.current = null;
    setScreenStream(null);
    setIsSharing(false);
    onScreenShareEnded?.();
  }, [onScreenShareEnded]);

  const startScreenShare = useCallback(async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing is not supported by your browser.');
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' } as MediaTrackConstraints, audio: true });

      // Keep microphone + shared-tab/system audio together. getDisplayMedia audio
      // is browser/platform dependent, so if it is unavailable the microphone remains.
      const micAudio = microphoneStream?.getAudioTracks()[0];
      const displayAudio = display.getAudioTracks()[0];
      let output = display;
      if (micAudio || displayAudio) {
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        if (micAudio) ctx.createMediaStreamSource(new MediaStream([micAudio])).connect(dest);
        if (displayAudio) ctx.createMediaStreamSource(new MediaStream([displayAudio])).connect(dest);
        output = new MediaStream([...display.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        audioContextRef.current = ctx;
        mixedDestinationRef.current = dest;
      }

      streamRef.current = output;
      setScreenStream(output);
      setIsSharing(true);
      const videoTrack = display.getVideoTracks()[0];
      if (videoTrack) videoTrack.onended = stopScreenShare;
      return output;
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') setError(err?.message || 'Failed to start screen sharing.');
      return null;
    }
  }, [microphoneStream, stopScreenShare]);

  useEffect(() => () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); audioContextRef.current?.close().catch(() => {}); }, []);

  return { screenStream, isSharing, error, startScreenShare, stopScreenShare };
}
