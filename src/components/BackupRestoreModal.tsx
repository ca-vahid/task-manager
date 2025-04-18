'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  backupData, 
  restoreData, 
  exportBackupToFile, 
  readBackupFile,
  BackupCollection,
  RestoreStrategy,
  BackupData,
  RestoreSummary
} from '@/lib/backup';

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
  const [statusHistory, setStatusHistory] = useState<{message: string, timestamp: string}[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupJson, setBackupJson] = useState<BackupData | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<RestoreSummary | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isLogExpanded, setIsLogExpanded] = useState(false);

  // Effect to scroll status history to bottom when new messages are added
  useEffect(() => {
    if (isLogExpanded) {
      const statusHistoryElement = document.getElementById('status-history-container');
      if (statusHistoryElement) {
        statusHistoryElement.scrollTop = statusHistoryElement.scrollHeight;
      }
    }
  }, [statusHistory, isLogExpanded]);

  if (!isOpen) return null;

  // Handle backup collections toggle
  const toggleCollection = (collection: BackupCollection) => {
    if (backupCollections.includes(collection)) {
      setBackupCollections(backupCollections.filter(c => c !== collection));
    } else {
      setBackupCollections([...backupCollections, collection]);
    }
  };

  // Add a message to status history with timestamp
  const addStatusHistoryMessage = (message: string) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    setStatusHistory(prev => [...prev, { message, timestamp }]);
  };

  // Handle progress updates with history tracking
  const updateProgress = (progress: number, message: string) => {
    setProgress(progress);
    setStatusMessage(message);
    addStatusHistoryMessage(message);
    
    // Animate progress bar
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${progress}%`;
      
      // Add transition class for smooth animation
      progressBarRef.current.classList.add('transition-all', 'duration-500', 'ease-in-out');
    }
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
    setStatusHistory([]);
    setStatusMessage('Starting backup...');
    addStatusHistoryMessage('Starting backup...');

    try {
      const data = await backupData({
        collections: backupCollections,
        progressCallback: updateProgress
      });

      // Export the backup data to a file
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      exportBackupToFile(data, `task-manager-backup-${timestamp}.json`);
      
      setStatusMessage('Backup completed successfully!');
      addStatusHistoryMessage('Backup completed successfully!');
    } catch (err: any) {
      setError(`Backup failed: ${err.message || 'Unknown error'}`);
      addStatusHistoryMessage(`Error: ${err.message || 'Unknown error'}`);
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
      setStatusHistory([]);
      addStatusHistoryMessage(`Selected file: ${files[0].name}`);
      
      // Read the file to preview its contents
      readBackupFile(files[0])
        .then((data: BackupData) => {
          setBackupJson(data);
          setStatusMessage(`Backup file loaded: ${data.timestamp}`);
          addStatusHistoryMessage(`Backup file loaded: ${data.timestamp}`);
        })
        .catch((err: Error) => {
          setError(`Error reading backup file: ${err.message}`);
          addStatusHistoryMessage(`Error reading backup file: ${err.message}`);
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
    setRestoreSummary(null);
    setIsProcessing(true);
    setProgress(0);
    setStatusHistory([]);
    setStatusMessage('Starting restore...');
    addStatusHistoryMessage('Starting restore operation...');
    addStatusHistoryMessage(`Restore strategy: ${restoreStrategy === 'overwrite' ? 'Overwrite existing items' : 'Skip existing items'}`);

    try {
      // Count collections and items for progress display
      const collections = Object.keys(backupJson.collections);
      const totalItems = collections.reduce((sum, colName) => {
        return sum + (backupJson.collections[colName as BackupCollection]?.length || 0);
      }, 0);
      
      addStatusHistoryMessage(`Found ${collections.length} collections with ${totalItems} total items`);
      
      // Directly call restoreData with progress callback
      const summary = await restoreData(
        backupJson,
        {
          strategy: restoreStrategy,
          progressCallback: updateProgress
        }
      );
      
      setStatusMessage('Restore completed!');
      addStatusHistoryMessage('Restore operation completed successfully!');
      addStatusHistoryMessage(`Summary: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.errors} errors`);
      
      setRestoreSummary(summary);
      setShowRestoreConfirm(false);

      window.dispatchEvent(new CustomEvent('dataRestored'));

    } catch (err: any) {
      setError(`Restore failed: ${err.message || 'Unknown error'}`);
      addStatusHistoryMessage(`Error: ${err.message || 'Unknown error'}`);
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
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {/* Error message */}
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          {/* Enhanced Progress indicator */}
          {isProcessing && (
            <div className="mb-6">
              {/* Progress percentage and status */}
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {statusMessage}
                </span>
                <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  {progress}%
                </span>
              </div>
              
              {/* Progress bar */}
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  ref={progressBarRef}
                  className="h-full bg-indigo-600 dark:bg-indigo-500"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              
              {/* Status history log with toggle */}
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <button 
                    onClick={() => setIsLogExpanded(!isLogExpanded)}
                    className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <span>Operation Log</span>
                    <svg 
                      className={`ml-1 h-4 w-4 transition-transform duration-200 ${isLogExpanded ? 'transform rotate-180' : ''}`} 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {statusHistory.length} events
                  </span>
                </div>
                
                {isLogExpanded && (
                  <div 
                    id="status-history-container"
                    className="bg-gray-100 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 p-2 h-32 overflow-y-auto text-xs font-mono transition-all duration-300 ease-in-out"
                  >
                    {statusHistory.map((status, index) => (
                      <div key={index} className="mb-1 last:mb-0">
                        <span className="text-gray-500 dark:text-gray-400">[{status.timestamp}]</span>{' '}
                        <span className="text-gray-800 dark:text-gray-200">{status.message}</span>
                      </div>
                    ))}
                    {statusHistory.length === 0 && (
                      <div className="text-gray-500 dark:text-gray-400 italic">No activity yet...</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Success Message / Summary Display */}
          {!isProcessing && restoreSummary && (
            <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-md">
              <div className="flex items-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600 dark:text-green-400 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-base font-medium text-green-800 dark:text-green-200">Restore Completed Successfully</p>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-green-100 dark:border-green-900/30">
                  <p className="text-sm font-semibold text-green-700 dark:text-green-300 mb-1">Created</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">{restoreSummary.created}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-blue-100 dark:border-blue-900/30">
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1">Updated</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{restoreSummary.updated}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-100 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Skipped</p>
                  <p className="text-xl font-bold text-gray-600 dark:text-gray-400">{restoreSummary.skipped}</p>
                </div>
                <div className={`bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border ${
                  restoreSummary.errors > 0 
                    ? 'border-red-100 dark:border-red-900/30' 
                    : 'border-gray-100 dark:border-gray-700'
                }`}>
                  <p className={`text-sm font-semibold mb-1 ${
                    restoreSummary.errors > 0 
                      ? 'text-red-700 dark:text-red-300' 
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>Errors</p>
                  <p className={`text-xl font-bold ${
                    restoreSummary.errors > 0 
                      ? 'text-red-600 dark:text-red-400' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>{restoreSummary.errors}</p>
                </div>
              </div>
              
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                Total processed: <span className="font-semibold">{restoreSummary.processed}</span> items
              </p>
              
              {/* Operation Log */}
              <div className="mb-4">
                <button
                  onClick={() => setIsLogExpanded(!isLogExpanded)}
                  className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-2"
                >
                  <span>Operation Log</span>
                  <svg 
                    className={`ml-1 h-4 w-4 transition-transform duration-200 ${isLogExpanded ? 'transform rotate-180' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {isLogExpanded && (
                  <div className="bg-gray-100 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 p-2 max-h-32 overflow-y-auto text-xs font-mono">
                    {statusHistory.map((status, index) => (
                      <div key={index} className="mb-1 last:mb-0">
                        <span className="text-gray-500 dark:text-gray-400">[{status.timestamp}]</span>{' '}
                        <span className="text-gray-800 dark:text-gray-200">{status.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {restoreSummary.warnings.length > 0 && (
                <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-md">
                  <div className="flex items-start">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-1">Warnings ({restoreSummary.warnings.length})</p>
                      <ul className="text-xs text-yellow-700 dark:text-yellow-400 list-disc list-inside space-y-1 max-h-32 overflow-y-auto pr-2">
                        {restoreSummary.warnings.map((warning: string, index: number) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
              
              <button 
                onClick={() => { 
                  setRestoreSummary(null); 
                  setActiveTab('restore'); 
                  setSelectedFile(null); 
                  setBackupJson(null); 
                  setStatusHistory([]);
                }} 
                className="mt-4 text-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 px-4 py-2 rounded-md transition-colors"
              >
                Perform Another Restore
              </button>
            </div>
          )}

          {/* Backup Tab Content */}
          {activeTab === 'backup' && !isProcessing && !restoreSummary && (
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
          {activeTab === 'restore' && !isProcessing && !showRestoreConfirm && !restoreSummary && (
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