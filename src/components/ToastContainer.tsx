"use client";

import React, { ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Toast, ToastType } from './Toast';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: ReactNode;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onRemoveToast: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export function ToastContainer({ 
  toasts, 
  onRemoveToast, 
  position = 'bottom-right' 
}: ToastContainerProps) {
  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4'
  };

  return (
    <div 
      className={`fixed z-50 max-w-xs w-full flex flex-col ${positionClasses[position]}`}
      aria-live="assertive"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            action={toast.action}
            onClose={onRemoveToast}
          />
        ))}
      </AnimatePresence>
    </div>
  );
} 