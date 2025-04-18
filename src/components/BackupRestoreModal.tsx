'use client';

import React, { useState, useRef } from 'react';
import { 
  backupData, 
  restoreData, 
  exportBackupToFile, 
  readBackupFile,
  BackupCollection,
  RestoreStrategy,
  BackupData
} from '@/lib/backup/backupUtils';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BackupRestoreModal({ isOpen, onClose }: BackupRestoreModalProps) {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore'>('backup');
  const [backupCollections, setBackupCollections] = useState<BackupCollection[]>(['tasks', 'technicians', 'groups']);
  const [restoreStrategy, setRestoreStrategy] = useState<RestoreStrategy>('skip');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupJson, setBackupJson] = useState<BackupData | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  if (!isOpen) return null;

  // Handle backup collections toggle
  const toggleCollection = (collection: BackupCollection) => {
    if (backupCollections.includes(collection)) {
      setBackupCollections(backupCollections.filter(c => c !== collection));
    } else {
      setBackupCollections([...backupCollections, collection]);
    }
  };

  // Handle progress updates
  const updateProgress = (progress: number, message: string) => {
    setProgress(progress);
    setStatusMessage(message);
  };

  // Handle backup
  const handleBackup = async () => {
    if (backupCollections.length === 0) {
      setError('Please select at least one collection to backup');
      return;
    }

    setError(null);
    setIsProcessing(true);
    setProgress(0);
    setStatusMessage('Starting backup...');

    try {
      const data = await backupData({
        collections: backupCollections,
        progressCallback: updateProgress
      });

      // Export the backup data to a file
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      exportBackupToFile(data, `task-manager-backup-${timestamp}.json`);
      
      setStatusMessage('Backup completed successfully!');
    } catch (err: any) {
      setError(`Backup failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
      setError(null);
      
      // Read the file to preview its contents
      readBackupFile(files[0])
        .then(data => {
          setBackupJson(data);
          setStatusMessage(`Backup file loaded: ${data.timestamp}`);
        })
        .catch(err => {
          setError(`Error reading backup file: ${err.message}`);
          setBackupJson(null);
        });
    }
  };

  // Handle restore
  const handleRestore = async () => {
    if (!backupJson) {
      setError('Please select a valid backup file');
      return;
    }

    setError(null);
    setIsProcessing(true);
    setProgress(0);
    setStatusMessage('Starting restore...');

    try {
      await restoreData(backupJson, {
        strategy: restoreStrategy,
        progressCallback: updateProgress
      });
      
      setStatusMessage('Restore completed successfully!');
      setShowRestoreConfirm(false);
    } catch (err: any) {
      setError(`Restore failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Backup & Restore
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <span className="sr-only">Close</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'backup'
                ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('backup')}
          >
            Backup
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'restore'
                ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('restore')}
          >
            Restore
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Error message */}
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          {/* Progress indicator */}
          {isProcessing && (
            <div className="mb-4">
              <div className="relative h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 dark:bg-indigo-400 transition-all duration-300 ease-in-out"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {statusMessage}
              </p>
            </div>
          )}

          {/* Backup Tab Content */}
          {activeTab === 'backup' && !isProcessing && (
            <div>
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Select the data you want to include in your backup:
              </p>

              <div className="space-y-3 mb-6">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={backupCollections.includes('tasks')}
                    onChange={() => toggleCollection('tasks')}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Tasks</span>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={backupCollections.includes('technicians')}
                    onChange={() => toggleCollection('technicians')}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Technicians</span>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={backupCollections.includes('groups')}
                    onChange={() => toggleCollection('groups')}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Groups</span>
                </label>
              </div>

              <button
                onClick={handleBackup}
                disabled={backupCollections.length === 0}
                className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Backup
              </button>
              
              {statusMessage && !isProcessing && (
                <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                  {statusMessage}
                </p>
              )}
            </div>
          )}

          {/* Restore Tab Content */}
          {activeTab === 'restore' && !isProcessing && !showRestoreConfirm && (
            <div>
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Select a backup file to restore:
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Backup File
                </label>
                <div className="flex items-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mr-2 py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Browse...
                  </button>
                  <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {selectedFile ? selectedFile.name : 'No file selected'}
                  </span>
                </div>
              </div>

              {backupJson && (
                <div className="mb-4">
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Backup Information:</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Date: {new Date(backupJson.timestamp).toLocaleString()}</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Contents: {Object.entries(backupJson.collections)
                        .map(([key, value]) => `${key} (${(value as any[]).length})`)
                        .join(', ')}
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Duplicate Handling
                </label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                      checked={restoreStrategy === 'skip'}
                      onChange={() => setRestoreStrategy('skip')}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Skip existing items</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                      checked={restoreStrategy === 'overwrite'}
                      onChange={() => setRestoreStrategy('overwrite')}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Overwrite existing items</span>
                  </label>
                </div>
              </div>

              <button
                onClick={() => setShowRestoreConfirm(true)}
                disabled={!backupJson}
                className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Restore From Backup
              </button>
            </div>
          )}

          {/* Restore Confirmation Dialog */}
          {activeTab === 'restore' && showRestoreConfirm && !isProcessing && (
            <div>
              <div className="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-md mb-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-300 font-semibold mb-2">
                  Warning: This action cannot be undone!
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  You are about to restore data from a backup. This may replace existing data
                  {restoreStrategy === 'overwrite' 
                    ? ' by overwriting it.' 
                    : ' but will skip existing items.'}
                </p>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowRestoreConfirm(false)}
                  className="py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRestore}
                  className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Confirm Restore
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 