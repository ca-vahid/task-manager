"use client";

import React, { useState } from 'react';
import { Task, TaskStatus, Technician, Group } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';

interface BulkAddTaskFormProps {
  technicians: Technician[];
  groups: Group[];
  currentOrderCount: number;
  onAddTasks: (tasks: Omit<Task, 'id'>[]) => Promise<void>;
  onCancel: () => void;
  onCreateGroup?: (name: string, description?: string) => Promise<Group>;
}

export function BulkAddTaskForm({ 
  technicians, 
  groups, 
  currentOrderCount, 
  onAddTasks, 
  onCancel,
  onCreateGroup
}: BulkAddTaskFormProps) {
  const [bulkText, setBulkText] = useState('');
  const [status, setStatus] = useState<TaskStatus>(TaskStatus.Open);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');

  // Parse bulk text into task titles
  const parseBulkText = (): string[] => {
    return bulkText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  };

  // Create a timestamp from a date string
  const createTimestamp = (dateString: string): Timestamp | null => {
    if (!dateString) return null;
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
      }
      return Timestamp.fromDate(date);
    } catch (error) {
      console.error('Error creating timestamp:', error);
      return null;
    }
  };

  // Submit the form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate input
    const taskTitles = parseBulkText();
    if (taskTitles.length === 0) {
      setError('Please enter at least one task title');
      return;
    }
    
    setError(null);
    setIsSubmitting(true);
    
    // Create tasks
    const dateTimestamp = createTimestamp(dueDate);
    const newTasks: Omit<Task, 'id'>[] = taskTitles.map((title, index) => ({
      title,
      explanation: '',
      status,
      assigneeId,
      groupId,
      estimatedCompletionDate: dateTimestamp,
      order: currentOrderCount + index,
      priorityLevel: null,
      tags: [],
      progress: 0,
      lastUpdated: Timestamp.now(),
      externalUrl: null,
      ticketNumber: null,
      ticketUrl: null
    }));
    
    try {
      await onAddTasks(newTasks);
    } catch (err: any) {
      console.error('Failed to add tasks:', err);
      setError(err.message || 'Failed to add tasks');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle creating a new group
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !onCreateGroup) {
      return;
    }
    
    try {
      const newGroup = await onCreateGroup(newGroupName.trim(), newGroupDescription.trim());
      setGroupId(newGroup.id);
      setShowNewGroupForm(false);
      setNewGroupName('');
      setNewGroupDescription('');
    } catch (err: any) {
      setError(err.message || "Failed to create new group.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-gray-800 p-4 rounded-md">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800/50 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
      
      <div>
        <label htmlFor="bulk-text" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Task Titles (one per line)
        </label>
        <textarea
          id="bulk-text"
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          rows={8}
          className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          placeholder="Enter one task per line..."
        ></textarea>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {parseBulkText().length} tasks will be created
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Status
          </label>
          <select 
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value={TaskStatus.Open}>Open</option>
            <option value={TaskStatus.Pending}>Pending</option>
            <option value={TaskStatus.Resolved}>Resolved</option>
          </select>
        </div>
        
        <div>
          <label htmlFor="assignee" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Assignee
          </label>
          <select 
            id="assignee"
            value={assigneeId || ""}
            onChange={(e) => setAssigneeId(e.target.value || null)}
            className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="">Unassigned</option>
            {technicians.map(tech => (
              <option key={tech.id} value={tech.id}>{tech.name}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor="due-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Due Date
          </label>
          <input 
            type="date" 
            id="due-date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
        
        <div>
          <label htmlFor="group" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Group
          </label>
          {showNewGroupForm ? (
            <div className="space-y-2">
              <input 
                type="text" 
                placeholder="New group name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <input 
                type="text" 
                placeholder="Group description (optional)"
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={!newGroupName.trim() || !onCreateGroup}
                  className="px-3 py-1 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewGroupForm(false)}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <select 
                id="group"
                value={groupId || ""}
                onChange={(e) => setGroupId(e.target.value || null)}
                className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="">No Group</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewGroupForm(true)}
                className="px-3 py-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-sm font-medium hover:bg-indigo-200 dark:hover:bg-indigo-800/30"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-md text-sm hover:from-blue-600 hover:to-indigo-700 flex items-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isSubmitting || parseBulkText().length === 0}
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Adding Tasks...
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Add {parseBulkText().length} Tasks
            </>
          )}
        </button>
      </div>
    </form>
  );
} 