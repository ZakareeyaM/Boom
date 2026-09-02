import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserX, Home } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';

export const RemovedPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const reason = (location.state as any)?.reason || 'You have been removed from this meeting by the host.';

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col text-slate-100">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center p-4 text-center max-w-md mx-auto space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
          <UserX className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold text-white">Removed from Meeting</h1>
          <p className="text-sm text-slate-400 leading-relaxed">{reason}</p>
        </div>

        <div className="pt-2 w-full">
          <Button
            variant="primary"
            size="md"
            onClick={() => navigate('/')}
            leftIcon={<Home className="w-4 h-4" />}
            className="w-full"
          >
            Return to Home
          </Button>
        </div>
      </main>

      <Footer />
    </div>
  );
};
