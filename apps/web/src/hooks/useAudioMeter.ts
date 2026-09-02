import { useState, useEffect, useRef } from 'react';

export function useAudioMeter(stream: MediaStream | null, isMuted: boolean = false) {
  const [volume, setVolume] = useState<number>(0); // 0 to 100
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSpeakingRef = useRef<boolean>(false);
  const lastVolumeUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || isMuted) {
      setVolume(0);
      setIsSpeaking(false);
      lastSpeakingRef.current = false;
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks[0].enabled) {
      setVolume(0);
      setIsSpeaking(false);
      lastSpeakingRef.current = false;
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
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
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [stream, isMuted]);

  return { volume, isSpeaking };
}
