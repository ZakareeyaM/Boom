# 🚀 Boom — Web-Based Video Conferencing Platform

> **Meet. Talk. Connect.**

Boom is a modern, web-based video conferencing platform built strictly for modern browsers. Boom requires **zero desktop apps, zero mobile apps, zero browser extensions, and zero plugins**.

---

## 🌟 Highlights & Features

- **Browser-Native WebRTC**: Crystal-clear HD video and low-latency audio via native browser APIs (`getUserMedia` & `getDisplayMedia`).
- **Pre-Join Screen**: Live camera preview, real-time microphone volume visualizer, device selector (cam, mic, speaker), display name input, and meeting invite link copier.
- **Adaptive Video Grid**: Dynamically adjusts layout for 1, 2, 4, 6, and up to 10 participants.
- **Active Speaker Detection**: Real-time voice visualizer with animated glowing borders.
- **Camera Off Avatar State**: Displays high-contrast initials avatar with pulsing audio indicator — *never a broken black rectangle*.
- **Screen Sharing**: One-click screen/tab/window sharing with large presentation stage and docked participant video strip.
- **Real-Time Meeting Chat**: Instant WebSocket messaging with timestamps and host badges.
- **Participants Roster**: Live list with mic/camera status and host moderation controls.
- **Host Controls (Server-Validated)**:
  - Mute participant
  - Remove participant (with target confirmation and kicked feedback)
  - End meeting for everyone
- **Authentication & Guest Access**: Registered accounts with persistent meeting history + instant 1-click guest participation.
- **Resilient Connection Lifecycle**: Automatic reconnection handling with connection quality metrics (🟢 Excellent, 🟡 Unstable, 🔴 Poor).
- **Responsive & Accessible**: Clean 2026 UI theme with dark mode, full mobile Chrome support, and accessible ARIA attributes.

---

## 🏗️ Architecture & Tech Stack

```
Boom/
├── apps/
│   ├── api/             # Node.js + Express + Socket.IO Signaling Server
│   └── web/             # React 19 + TypeScript + Vite + Tailwind CSS
├── packages/
│   └── types/           # Shared DTOs, WebRTC payloads, and Socket events
├── database/            # PostgreSQL DDL schema & migrations
├── Dockerfile           # Multi-stage production container build
└── docker-compose.yml   # PostgreSQL + Boom App orchestration
```

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, TanStack Query, React Router v7.
- **Backend**: Node.js, Express, Socket.IO, bcryptjs, jsonwebtoken, zod.
- **Database**: PostgreSQL with DDL migrations (plus automatic zero-config file/memory store for standalone local dev).
- **Signaling & WebRTC**: WebSocket / Socket.IO mesh signaling relay with Google STUN servers.

---

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 20+ / 24+
- npm 10+

### 1. Install Dependencies
```bash
npm install
```

### 2. Build Shared Types
```bash
npm --workspace=packages/types run build
```

### 3. Start Development Servers
```bash
# Run both API and Web concurrently
npm run dev

# Or in separate terminal tabs:
npm run dev:api    # Starts API server on http://localhost:5000
npm run dev:web    # Starts Vite Web dev server on http://localhost:3000
```

Open your browser to `http://localhost:3000`.

---

## 🐳 Production Deployment (Docker)

To run the complete production stack (PostgreSQL + compiled Boom App):

```bash
docker compose up --build -d
```

The application will be live at `http://localhost:5000`.

---

## 🧪 Running Automated Tests

Run the backend unit and integration test suite:

```bash
npm test
```

Test coverage includes:
- Secure meeting code generation (`XXXX-XXXX` format, entropy, charset collision check)
- User registration and password hashing verification
- JWT signing and authentication middleware
- Meeting creation and retrieval
- Server-side host-only permissions enforcement

---

## 🔒 Security & Best Practices

- **Zero Plaintext Passwords**: Hashed with `bcryptjs` (salt rounds: 10).
- **Server-Side Authorization**: Host privileges (muting, removing participants, ending calls) are strictly validated on the server.
- **Unpredictable Meeting Codes**: Cryptographically secure 8-character codes (`[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}`) eliminating ambiguous characters (no 0/O/1/I/L).
- **Graceful Error Handling**: Polite permission denial banners and instructions for enabling camera/mic permissions without crashing the web app.

---

## 📄 License
MIT License. Built for **Boom** — *Meet. Talk. Connect.*
