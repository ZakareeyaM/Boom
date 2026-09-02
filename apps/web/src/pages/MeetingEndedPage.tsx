import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { PhoneOff, Video, Home, Plus } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';

export const MeetingEndedPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const reason = (location.state as any)?.reason || 'This meeting has ended.';

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col text-slate-100">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center p-4 text-center max-w-md mx-auto space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center mx-auto shadow-lg shadow-brand-500/10">
          <PhoneOff className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold text-white">Meeting Ended</h1>
          <p className="text-sm text-slate-400 leading-relaxed">{reason}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={() => navigate('/')}
            leftIcon={<Home className="w-4 h-4" />}
            className="w-full"
          >
            Return Home
          </Button>

          <Button
            variant="secondary"
            size="md"
            onClick={() => navigate('/')}
            leftIcon={<Plus className="w-4 h-4" />}
            className="w-full"
          >
            New Meeting
          </Button>
        </div>
      </main>

      <Footer />
    </div>
  );
};
