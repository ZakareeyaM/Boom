import React, { createContext, useContext } from 'react';

// Auth is removed — Boom is fully guest-first. Users identify by display name only.
// This stub keeps useAuth() calls in the codebase compiling without changes.
interface AuthContextType {
  user: null;
  token: null;
}

const AuthContext = createContext<AuthContextType>({ user: null, token: null });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthContext.Provider value={{ user: null, token: null }}>
    {children}
  </AuthContext.Provider>
);

export function useAuth() {
  return useContext(AuthContext);
}
