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

      // Stop any existing tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
        video: videoDeviceId
          ? { deviceId: { exact: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
      };

      try {
        const userStream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = userStream;
        setStream(userStream);

        // Apply current audio/video toggle states
        const audioTracks = userStream.getAudioTracks();
        if (audioTracks.length > 0) {
          audioTracks[0].enabled = audioEnabledRef.current;
        }

        const videoTracks = userStream.getVideoTracks();
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

  // Toggle Camera
  const toggleVideo = useCallback(() => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      const newState = !videoTrack.enabled;
      videoTrack.enabled = newState;
      setVideoEnabled(newState);
    } else {
      setVideoEnabled((prev) => !prev);
    }
  }, []);

  // Set camera state explicitly (e.g. when the host disables your camera).
  const setVideoState = useCallback((enabled: boolean) => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = enabled;
    setVideoEnabled(enabled);
  }, []);

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
