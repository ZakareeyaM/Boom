// The free "OpenRelay" TURN demo server (openrelayproject/openrelayproject)
// has become heavily overloaded in practice — it drops and delays packets far
// more than a real TURN server. On a relayed (TURN) connection that shows up
// as exactly the symptoms of packet loss on a voice codec: choppy, scratchy,
// warbly/robotic-sounding audio, because Opus's packet-loss-concealment is
// constantly having to "guess" missing audio. It's also asymmetric in
// practice — one direction of the relay can be fine while the other is badly
// congested, which produces "only one side can hear the other." It still ships
// here as a fallback so calls have *some* chance of connecting through
// restrictive NATs, but for reliable audio you should get your own free/paid
// TURN credentials (e.g. metered.ca, Twilio, Cloudflare Calls, Xirsys all have
// free tiers) and set VITE_ICE_SERVERS_JSON in your web app's environment —
// no code changes needed. Example:
//   VITE_ICE_SERVERS_JSON=[{"urls":"turn:global.relay.metered.ca:80","username":"...","credential":"..."}]
const defaultIceServers: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

function resolveIceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_ICE_SERVERS_JSON;
  if (!raw) return defaultIceServers;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Custom servers take priority but Google STUN stays in the mix as a
      // cheap, reliable fallback for candidate gathering.
      return [...parsed, ...defaultIceServers.filter((s) => typeof s.urls === 'string' && s.urls.startsWith('stun:'))];
    }
  } catch (err) {
    console.warn('Invalid VITE_ICE_SERVERS_JSON, falling back to defaults:', err);
  }
  return defaultIceServers;
}

export const rtcConfiguration: RTCConfiguration = {
  iceServers: resolveIceServers(),
  iceCandidatePoolSize: 10,
};