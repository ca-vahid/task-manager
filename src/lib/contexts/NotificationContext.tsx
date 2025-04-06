"use client";

import React, { createContext, useState, useContext, useCallback } from 'react';
import { ToastContainer, ToastItem } from '@/components/ToastContainer';
import { ToastType } from '@/components/Toast';

interface NotificationContextProps {
  showToast: (message: string, type: ToastType, duration?: number) => void;
  clearToasts: () => void;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prevToasts) => [...prevToasts, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter(toast => toast.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <NotificationContext.Provider value={{ showToast, clearToasts }}>
      {children}
      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  
  return context;
} 