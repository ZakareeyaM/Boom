import { useState, useEffect, useRef, useCallback } from 'react';

export interface MediaDeviceInfoList {
  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
}

export interface PermissionError {
  type: 'denied' | 'not_found' | 'in_use' | 'unknown';
  message: string;
}

// Runs the raw microphone track through a small Web Audio processing chain
// before it ever reaches WebRTC:
//   1. A highpass filter removes sub-80Hz rumble (desk thumps, AC hum, mic
//      handling noise) that otherwise eats into headroom.
//   2. A hard limiter caps peak level.
//
// The limiter matters specifically for acoustic feedback (the classic PA
// speaker screech): if a room's mic picks up any of its own speaker output,
// that leaked audio goes out, comes back through the far end's speaker, gets
// picked up again, and gets a little louder every lap — a runaway loop that
// escalates into a piercing screech and drowns out speech. The browser's
// built-in echoCancellation constraint is the primary defense and stays on,
// but it isn't perfect on every device/room, especially without headphones.
// This limiter is the safety net: it caps how loud any leaked/looping audio
// can get before it's sent, so a small amount of echo can't snowball into a
// screech. It also quietly helps with harsh/clipped "static-y" audio from
// loud input spikes in general.
//
// Falls back to the raw, unprocessed track if Web Audio isn't available or
// construction fails for any reason, so a mic never silently stops working.
function buildProcessedMicTrack(rawTrack: MediaStreamTrack): { track: MediaStreamTrack; ctx: AudioContext | null } {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return { track: rawTrack, ctx: null };

    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(new MediaStream([rawTrack]));

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -24;
    limiter.knee.value = 6;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;

    const dest = ctx.createMediaStreamDestination();
    source.connect(highpass);
    highpass.connect(limiter);
    limiter.connect(dest);

    const processedTrack = dest.stream.getAudioTracks()[0];
    if (!processedTrack) {
      ctx.close().catch(() => {});
      return { track: rawTrack, ctx: null };
    }
    return { track: processedTrack, ctx };
  } catch (err) {
    console.warn('Mic processing chain failed, using raw microphone track:', err);
    return { track: rawTrack, ctx: null };
  }
}

export function useMediaStream(initialAudio = true, initialVideo = true) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(initialAudio);
  const [videoEnabled, setVideoEnabled] = useState<boolean>(initialVideo);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<PermissionError | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfoList>({
    audioInputs: [],
    videoInputs: [],
    audioOutputs: [],
  });
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');

  const streamRef = useRef<MediaStream | null>(null);
  // The unprocessed getUserMedia() stream. We keep a separate handle to it
  // purely so we can stop its tracks (and thereby release the physical mic/
  // camera and turn off the OS "recording" indicator) — the stream actually
  // exposed to the rest of the app (`streamRef`) carries the *processed*
  // audio track instead of this one.
  const rawStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioEnabledRef = useRef<boolean>(initialAudio);
  const videoEnabledRef = useRef<boolean>(initialVideo);

  audioEnabledRef.current = audioEnabled;
  videoEnabledRef.current = videoEnabled;

  // Enumerate all available audio and video devices
  const updateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        audioInputs: deviceList.filter((d) => d.kind === 'audioinput'),
        videoInputs: deviceList.filter((d) => d.kind === 'videoinput'),
        audioOutputs: deviceList.filter((d) => d.kind === 'audiooutput'),
      });
    } catch (err) {
      console.warn('Failed to enumerate devices', err);
    }
  }, []);

  // Request media stream from browser
  const initMedia = useCallback(
    async (audioDeviceId?: string, videoDeviceId?: string) => {
      setIsLoading(true);
      setError(null);

      // Stop any existing tracks/graph from a previous call (device switch, retry, etc).
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (rawStreamRef.current) {
        rawStreamRef.current.getTracks().forEach((track) => track.stop());
        rawStreamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }

      const constraints: MediaStreamConstraints = {
        audio: {
          ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}),
          // Use the browser's built-in voice processing to suppress feedback,
          // room noise and keyboard/fan noise before WebRTC encoding.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Mono voice capture avoids channel mismatches and reduces the chance
          // of duplicated/phasey microphone audio on some devices.
          channelCount: 1,
          sampleRate: 48000,
          sampleSize: 16,
          // Deliberately NOT setting an explicit `latency` constraint. Forcing
          // an aggressive low-latency capture buffer (this previously
          // requested 10ms) can destabilize the browser's internal echo
          // cancellation, which needs a stable capture/playout timing
          // reference to know what to subtract — undermining the very thing
          // meant to stop feedback/echo. Letting the browser pick its own
          // default keeps echoCancellation working reliably.
        },
        video: videoDeviceId
          ? { deviceId: { exact: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
      };

      try {
        const userStream = await navigator.mediaDevices.getUserMedia(constraints);
        rawStreamRef.current = userStream;

        let finalStream = userStream;
        const rawAudioTrack = userStream.getAudioTracks()[0];
        if (rawAudioTrack) {
          const { track: processedTrack, ctx } = buildProcessedMicTrack(rawAudioTrack);
          audioCtxRef.current = ctx;
          if (processedTrack !== rawAudioTrack) {
            finalStream = new MediaStream([processedTrack, ...userStream.getVideoTracks()]);
          }
        }

        streamRef.current = finalStream;
        setStream(finalStream);

        // Apply current audio/video toggle states
        const audioTracks = finalStream.getAudioTracks();
        if (audioTracks.length > 0) {
          audioTracks[0].enabled = audioEnabledRef.current;
        }

        const videoTracks = finalStream.getVideoTracks();
        if (videoTracks.length > 0) {
          videoTracks[0].enabled = videoEnabledRef.current;
        }

        await updateDevices();
      } catch (err: any) {
        console.error('getUserMedia error:', err);
        let errType: PermissionError['type'] = 'unknown';
        let errMsg = "Boom can't access your camera or microphone. Please check your browser permissions.";

        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errType = 'denied';
          errMsg = 'Camera or microphone permission was denied. Please allow access in Chrome address bar (lock icon) and refresh.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          errType = 'not_found';
          errMsg = 'No camera or microphone found on your device.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          errType = 'in_use';
          errMsg = 'Your camera or microphone is currently in use by another application.';
        }

        setError({ type: errType, message: errMsg });

        // Fallback: create empty dummy stream so UI does not crash
        try {
          const emptyStream = new MediaStream();
          streamRef.current = emptyStream;
          setStream(emptyStream);
        } catch {}
      } finally {
        setIsLoading(false);
      }
    },
    [updateDevices]
  );

  useEffect(() => {
    initMedia();

    // Listen for device plug/unplug changes
    navigator.mediaDevices?.addEventListener('devicechange', updateDevices);

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', updateDevices);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (rawStreamRef.current) {
        rawStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [initMedia, updateDevices]);

  // Toggle Microphone
  const toggleAudio = useCallback(() => {
    if (!streamRef.current) return;
    const audioTrack = streamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      const newState = !audioTrack.enabled;
      audioTrack.enabled = newState;
      setAudioEnabled(newState);
    } else {
      setAudioEnabled((prev) => !prev);
    }
  }, []);

  // Set audio enabled explicitly (e.g. muted by host)
  const setAudioState = useCallback((enabled: boolean) => {
    if (!streamRef.current) return;
    const audioTrack = streamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = enabled;
    }
    setAudioEnabled(enabled);
  }, []);

  // Camera control deliberately stops the video track when the camera is
  // disabled. Setting track.enabled=false only stops frames; browsers may
  // keep the physical camera capture active (and therefore keep its LED on).
  // Stopping the track releases the camera device. Re-enabling acquires a new
  // video track and replaces it in the local MediaStream.
  const setVideoState = useCallback(async (enabled: boolean) => {
    const currentStream = streamRef.current;

    if (!enabled) {
      const videoTracks = currentStream?.getVideoTracks() || [];
      videoTracks.forEach((track) => {
        track.enabled = false;
        track.stop();
      });

      if (currentStream) {
        const audioTracks = currentStream.getAudioTracks();
        const nextStream = new MediaStream(audioTracks);
        streamRef.current = nextStream;
        setStream(nextStream);
      }

      videoEnabledRef.current = false;
      setVideoEnabled(false);
      await updateDevices();
      return;
    }

    // Already has a live video track.
    const existing = currentStream?.getVideoTracks().find((track) => track.readyState === 'live');
    if (existing) {
      existing.enabled = true;
      videoEnabledRef.current = true;
      setVideoEnabled(true);
      return;
    }

    try {
      const videoConstraints: MediaTrackConstraints = selectedVideoId
        ? { deviceId: { exact: selectedVideoId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };

      const cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
      const newVideoTrack = cameraStream.getVideoTracks()[0];
      if (!newVideoTrack) throw new Error('No video track was returned by the camera.');

      const audioTracks = streamRef.current?.getAudioTracks() || [];
      const nextStream = new MediaStream([...audioTracks, newVideoTrack]);
      streamRef.current = nextStream;
      setStream(nextStream);
      videoEnabledRef.current = true;
      setVideoEnabled(true);
      setError(null);
      await updateDevices();
    } catch (err: any) {
      console.error('Failed to re-enable camera:', err);
      setVideoEnabled(false);
      videoEnabledRef.current = false;
      setError({
        type: err?.name === 'NotAllowedError' ? 'denied' : 'unknown',
        message: err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access and try again.'
          : 'Boom could not turn your camera back on. Please check that the camera is available.',
      });
    }
  }, [selectedVideoId, updateDevices]);

  const toggleVideo = useCallback(() => {
    void setVideoState(!videoEnabledRef.current);
  }, [setVideoState]);

  // Switch Audio Input Device
  const switchAudioDevice = useCallback(
    async (deviceId: string) => {
      setSelectedAudioId(deviceId);
      await initMedia(deviceId, selectedVideoId || undefined);
    },
    [initMedia, selectedVideoId]
  );

  // Switch Video Input Device
  const switchVideoDevice = useCallback(
    async (deviceId: string) => {
      setSelectedVideoId(deviceId);
      await initMedia(selectedAudioId || undefined, deviceId);
    },
    [initMedia, selectedAudioId]
  );

  return {
    stream,
    audioEnabled,
    videoEnabled,
    isLoading,
    error,
    devices,
    selectedAudioId,
    selectedVideoId,
    toggleAudio,
    setAudioState,
    toggleVideo,
    setVideoState,
    switchAudioDevice,
    switchVideoDevice,
    retryPermissions: () => initMedia(selectedAudioId || undefined, selectedVideoId || undefined),
  };
}
