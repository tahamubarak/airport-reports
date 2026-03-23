import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSessionStore } from '../store/useSessionStore';

interface ProtectedRouteProps { children: React.ReactNode; }

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isSessionValid } = useSessionStore();
  const location = useLocation();

  if (!isSessionValid()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

interface AdminRouteProps { children: React.ReactNode; }

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { session, isSessionValid } = useSessionStore();
  const location = useLocation();

  if (!isSessionValid()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!session?.isGlobalAdmin && !session?.isSiteAdmin && !session?.isAppAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
