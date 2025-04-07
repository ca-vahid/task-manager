"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useNotification } from './NotificationContext';

// Define the types of operations that can be undone
export type UndoableActionType = 
  | 'DELETE_CONTROL' 
  | 'UPDATE_CONTROL_TITLE' 
  | 'UPDATE_CONTROL_DATE' 
  | 'UPDATE_CONTROL_STATUS'
  | 'UPDATE_CONTROL_ASSIGNEE' 
  | 'REORDER_CONTROLS';

// Interface for undoable actions
export interface UndoableAction {
  id: string;
  type: UndoableActionType;
  timestamp: number;
  data: any; // The original data needed to restore state
  externalAction?: boolean; // Flag if it involves external systems that may not be undoable
}

interface UndoContextProps {
  // Show a toast with undo button
  showUndoToast: (message: string, undoAction: () => Promise<void>, duration?: number) => string;
  
  // Add an action to the undo history
  addUndoableAction: (action: Omit<UndoableAction, 'id' | 'timestamp'>) => string;
  
  // Get all undoable actions
  getUndoableActions: () => UndoableAction[];
  
  // Clear all undoable actions
  clearUndoableActions: () => void;
}

const UndoContext = createContext<UndoContextProps | undefined>(undefined);

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const { showToast, dismissToast } = useNotification();
  const [undoableActions, setUndoableActions] = useState<UndoableAction[]>([]);
  const [pendingTimers, setPendingTimers] = useState<{[key: string]: NodeJS.Timeout}>({});

  // Add an undoable action to the history
  const addUndoableAction = useCallback((action: Omit<UndoableAction, 'id' | 'timestamp'>): string => {
    const id = Math.random().toString(36).substring(2, 9);
    const timestamp = Date.now();
    
    const newAction: UndoableAction = {
      ...action,
      id,
      timestamp
    };
    
    setUndoableActions(prev => [newAction, ...prev]);
    return id;
  }, []);

  // Show a toast with an undo button
  const showUndoToast = useCallback((message: string, undoAction: () => Promise<void>, duration = 10000): string => {
    const toastId = Math.random().toString(36).substring(2, 9);
    
    // Create an undo button
    const undoButton = (
      <button 
        onClick={async () => {
          try {
            // Clear the timeout if it exists
            if (pendingTimers[toastId]) {
              clearTimeout(pendingTimers[toastId]);
              const updatedTimers = {...pendingTimers};
              delete updatedTimers[toastId];
              setPendingTimers(updatedTimers);
            }
            
            // Execute the undo action
            await undoAction();
            
            // Show success toast
            showToast("Action undone successfully", "success", 3000);
          } catch (error) {
            console.error("Error undoing action:", error);
            showToast(`Failed to undo: ${error instanceof Error ? error.message : 'Unknown error'}`, "error", 5000);
          } finally {
            // Dismiss the undo toast
            dismissToast(toastId);
          }
        }}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-md mt-1 inline-flex items-center"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
        Undo
      </button>
    );
    
    // Show the toast with the undo button
    showToast(message, "info", duration, toastId, undoButton);
    
    // Set a timer to clean up if undo isn't clicked
    const timer = setTimeout(() => {
      const updatedTimers = {...pendingTimers};
      delete updatedTimers[toastId];
      setPendingTimers(updatedTimers);
    }, duration);
    
    // Store the timer
    setPendingTimers(prev => ({
      ...prev,
      [toastId]: timer
    }));
    
    return toastId;
  }, [showToast, dismissToast, pendingTimers]);

  // Get all undoable actions
  const getUndoableActions = useCallback(() => {
    return [...undoableActions];
  }, [undoableActions]);

  // Clear all undoable actions
  const clearUndoableActions = useCallback(() => {
    setUndoableActions([]);
  }, []);

  return (
    <UndoContext.Provider
      value={{
        showUndoToast,
        addUndoableAction,
        getUndoableActions,
        clearUndoableActions,
      }}
    >
      {children}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const context = useContext(UndoContext);
  
  if (context === undefined) {
    throw new Error('useUndo must be used within an UndoProvider');
  }
  
  return context;
} 