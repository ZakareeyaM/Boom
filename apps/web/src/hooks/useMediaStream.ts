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
        audioInputs: deviceList.filter(
          (device) => device.kind === 'audioinput'
        ),
        videoInputs: deviceList.filter(
          (device) => device.kind === 'videoinput'
        ),
        audioOutputs: deviceList.filter(
          (device) => device.kind === 'audiooutput'
        ),
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
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      }

      /*
       * Audio processing:
       * - echoCancellation prevents microphone feedback
       * - noiseSuppression reduces background noise
       * - autoGainControl keeps voice volume consistent
       * - channelCount: 1 forces mono microphone capture
       * - sampleRate: 48000 is the standard WebRTC voice rate
       * - sampleSize: 16-bit audio
       *
       * NOTE:
       * Do NOT add "latency" here.
       * It is not part of TypeScript's MediaTrackConstraints
       * and causes the project to fail during tsc.
       */
      const audioConstraints: MediaTrackConstraints = {
        ...(audioDeviceId
          ? { deviceId: { exact: audioDeviceId } }
          : {}),

        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,

        channelCount: 1,
        sampleRate: 48000,
        sampleSize: 16,
      };

      const videoConstraints: MediaTrackConstraints = videoDeviceId
        ? {
            deviceId: { exact: videoDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          };

      const constraints: MediaStreamConstraints = {
        audio: audioConstraints,
        video: videoConstraints,
      };

      try {
        const userStream =
          await navigator.mediaDevices.getUserMedia(constraints);

        streamRef.current = userStream;
        setStream(userStream);

        // Apply current audio toggle state
        const audioTracks = userStream.getAudioTracks();

        if (audioTracks.length > 0) {
          audioTracks[0].enabled = audioEnabledRef.current;
        }

        // Apply current video toggle state
        const videoTracks = userStream.getVideoTracks();

        if (videoTracks.length > 0) {
          videoTracks[0].enabled = videoEnabledRef.current;
        }

        await updateDevices();
      } catch (err: any) {
        console.error('getUserMedia error:', err);

        let errType: PermissionError['type'] = 'unknown';

        let errMsg =
          "Boom can't access your camera or microphone. Please check your browser permissions.";

        if (
          err.name === 'NotAllowedError' ||
          err.name === 'PermissionDeniedError'
        ) {
          errType = 'denied';

          errMsg =
            'Camera or microphone permission was denied. Please allow access in your browser address bar and refresh.';
        } else if (
          err.name === 'NotFoundError' ||
          err.name === 'DevicesNotFoundError'
        ) {
          errType = 'not_found';

          errMsg =
            'No camera or microphone was found on your device.';
        } else if (
          err.name === 'NotReadableError' ||
          err.name === 'TrackStartError'
        ) {
          errType = 'in_use';

          errMsg =
            'Your camera or microphone is currently in use by another application.';
        }

        setError({
          type: errType,
          message: errMsg,
        });

        // Fallback: create an empty stream so the UI does not crash
        try {
          const emptyStream = new MediaStream();

          streamRef.current = emptyStream;
          setStream(emptyStream);
        } catch {
          // Ignore MediaStream creation failure
        }
      } finally {
        setIsLoading(false);
      }
    },
    [updateDevices]
  );

  useEffect(() => {
    void initMedia();

    // Listen for device plug/unplug changes
    navigator.mediaDevices?.addEventListener(
      'devicechange',
      updateDevices
    );

    return () => {
      navigator.mediaDevices?.removeEventListener(
        'devicechange',
        updateDevices
      );

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      }
    };
  }, [initMedia, updateDevices]);

  // Toggle Microphone
  const toggleAudio = useCallback(() => {
    if (!streamRef.current) return;

    const audioTrack =
      streamRef.current.getAudioTracks()[0];

    if (audioTrack) {
      const newState = !audioTrack.enabled;

      audioTrack.enabled = newState;

      audioEnabledRef.current = newState;
      setAudioEnabled(newState);
    } else {
      setAudioEnabled((previous) => {
        const newState = !previous;

        audioEnabledRef.current = newState;

        return newState;
      });
    }
  }, []);

  // Set audio enabled explicitly
  const setAudioState = useCallback(
    (enabled: boolean) => {
      if (streamRef.current) {
        const audioTracks =
          streamRef.current.getAudioTracks();

        audioTracks.forEach((track) => {
          track.enabled = enabled;
        });
      }

      audioEnabledRef.current = enabled;
      setAudioEnabled(enabled);
    },
    []
  );

  /*
   * Camera control.
   *
   * When disabled, completely stop the video track so that
   * the physical camera is released.
   *
   * When enabled again, acquire a fresh video track.
   */
  const setVideoState = useCallback(
    async (enabled: boolean) => {
      const currentStream = streamRef.current;

      if (!enabled) {
        const videoTracks =
          currentStream?.getVideoTracks() || [];

        videoTracks.forEach((track) => {
          track.enabled = false;
          track.stop();
        });

        if (currentStream) {
          const audioTracks =
            currentStream.getAudioTracks();

          const nextStream = new MediaStream(audioTracks);

          streamRef.current = nextStream;
          setStream(nextStream);
        }

        videoEnabledRef.current = false;
        setVideoEnabled(false);

        await updateDevices();

        return;
      }

      // Check whether a live video track already exists
      const existingVideoTrack =
        currentStream
          ?.getVideoTracks()
          .find(
            (track) => track.readyState === 'live'
          );

      if (existingVideoTrack) {
        existingVideoTrack.enabled = true;

        videoEnabledRef.current = true;
        setVideoEnabled(true);

        return;
      }

      try {
        const videoConstraints: MediaTrackConstraints =
          selectedVideoId
            ? {
                deviceId: {
                  exact: selectedVideoId,
                },
                width: {
                  ideal: 1280,
                },
                height: {
                  ideal: 720,
                },
              }
            : {
                width: {
                  ideal: 1280,
                },
                height: {
                  ideal: 720,
                },
              };

        const cameraStream =
          await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: videoConstraints,
          });

        const newVideoTrack =
          cameraStream.getVideoTracks()[0];

        if (!newVideoTrack) {
          throw new Error(
            'No video track was returned by the camera.'
          );
        }

        const audioTracks =
          streamRef.current?.getAudioTracks() || [];

        const nextStream = new MediaStream([
          ...audioTracks,
          newVideoTrack,
        ]);

        streamRef.current = nextStream;
        setStream(nextStream);

        videoEnabledRef.current = true;
        setVideoEnabled(true);

        setError(null);

        await updateDevices();
      } catch (err: any) {
        console.error(
          'Failed to re-enable camera:',
          err
        );

        videoEnabledRef.current = false;
        setVideoEnabled(false);

        setError({
          type:
            err?.name === 'NotAllowedError'
              ? 'denied'
              : 'unknown',

          message:
            err?.name === 'NotAllowedError'
              ? 'Camera permission was denied. Please allow camera access and try again.'
              : 'Boom could not turn your camera back on. Please check that the camera is available.',
        });
      }
    },
    [selectedVideoId, updateDevices]
  );

  const toggleVideo = useCallback(() => {
    void setVideoState(
      !videoEnabledRef.current
    );
  }, [setVideoState]);

  // Switch Audio Input Device
  const switchAudioDevice = useCallback(
    async (deviceId: string) => {
      setSelectedAudioId(deviceId);

      await initMedia(
        deviceId,
        selectedVideoId || undefined
      );
    },
    [initMedia, selectedVideoId]
  );

  // Switch Video Input Device
  const switchVideoDevice = useCallback(
    async (deviceId: string) => {
      setSelectedVideoId(deviceId);

      await initMedia(
        selectedAudioId || undefined,
        deviceId
      );
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

    retryPermissions: () =>
      initMedia(
        selectedAudioId || undefined,
        selectedVideoId || undefined
      ),
  };
}
