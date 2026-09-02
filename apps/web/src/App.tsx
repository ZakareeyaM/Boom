import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { LandingPage } from './pages/LandingPage';
import { PreJoinPage } from './pages/PreJoinPage';
import { MeetingRoomPage } from './pages/MeetingRoomPage';
import { MeetingEndedPage } from './pages/MeetingEndedPage';
import { RemovedPage } from './pages/RemovedPage';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/join/:meetingCode" element={<PreJoinPage />} />
            <Route path="/meeting/:meetingId" element={<MeetingRoomPage />} />
            <Route path="/ended" element={<MeetingEndedPage />} />
            <Route path="/removed" element={<RemovedPage />} />
            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};
