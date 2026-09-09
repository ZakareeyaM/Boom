import { useState, useEffect, useRef } from 'react';

let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioCtx();
    }
    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

export function useAudioMeter(stream: MediaStream | null, isMuted: boolean = false) {
  const [volume, setVolume] = useState<number>(0); // 0 to 100
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSpeakingRef = useRef<boolean>(false);
  const lastVolumeUpdateRef = useRef<number>(0);

  const audioTrack = stream?.getAudioTracks()[0] || null;
  const trackId = audioTrack?.id || null;
  const isLive = audioTrack && audioTrack.readyState === 'live' && audioTrack.enabled && !isMuted;

  useEffect(() => {
    if (!stream || !audioTrack || !isLive) {
      setVolume(0);
      setIsSpeaking(false);
      lastSpeakingRef.current = false;
      return;
    }

    try {
      const audioContext = getSharedAudioContext();
      if (!audioContext) return;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const singleTrackStream = new MediaStream([audioTrack]);
      const source = audioContext.createMediaStreamSource(singleTrackStream);
      source.connect(analyser);
      sourceRef.current = source;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }

        const average = sum / bufferLength;
        const normalizedVolume = Math.min(100, Math.round((average / 128) * 100));
        const now = Date.now();

        // Throttle volume updates to at most once every 100ms to eliminate unnecessary React re-renders
        if (now - lastVolumeUpdateRef.current > 100) {
          lastVolumeUpdateRef.current = now;
          setVolume(normalizedVolume);
        }

        // Only update isSpeaking if state actually changes
        const speakingNow = normalizedVolume > 14;
        if (speakingNow !== lastSpeakingRef.current) {
          lastSpeakingRef.current = speakingNow;
          setIsSpeaking(speakingNow);
        }

        rafRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err) {
      console.warn('AudioMeter initialization failed', err);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch {}
        sourceRef.current = null;
      }
      analyserRef.current = null;
    };
  }, [trackId, isLive]);

  return { volume, isSpeaking };
}
