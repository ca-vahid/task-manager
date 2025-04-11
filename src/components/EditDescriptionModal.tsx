"use client";

import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';

interface EditDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDescription: string;
  onSave: (newDescription: string) => Promise<void>;
  taskTitle: string; // To display in the modal header
}

export function EditDescriptionModal({
  isOpen,
  onClose,
  initialDescription,
  onSave,
  taskTitle
}: EditDescriptionModalProps) {
  const [description, setDescription] = useState(initialDescription);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset description when modal opens with new initial data
  useEffect(() => {
    if (isOpen) {
      setDescription(initialDescription);
      setIsSaving(false);
      setError(null);
    }
  }, [isOpen, initialDescription]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(description);
      onClose(); // Close modal on successful save
    } catch (err) {
      console.error("Failed to save description:", err);
      setError("Failed to save description. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-300 ease-out" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl h-[90vh] max-h-[800px] flex flex-col overflow-hidden transform transition-all duration-300 ease-out scale-100">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-900 dark:text-white truncate pr-4">
            Edit Description: <span className="font-normal">{taskTitle}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-900"
            aria-label="Close modal"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Body - Text Area */}
        <div className="flex-grow p-4 overflow-y-auto">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter task description here..."
            className="w-full h-full resize-none p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-800 dark:text-white text-sm leading-relaxed focus:outline-none transition-colors"
            aria-label="Task description editor"
          />
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="ml-auto flex space-x-3">
             <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:focus:ring-offset-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            >
              {isSaving ? (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : null}
              {isSaving ? 'Saving...' : 'Save Description'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 