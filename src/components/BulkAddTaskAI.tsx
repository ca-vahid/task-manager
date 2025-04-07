"use client";

import React, { useState } from 'react';
import { Task, Technician, TaskStatus, Group, PriorityLevel } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { TaskReviewForm } from './TaskReviewForm';

interface BulkAddTaskAIProps {
  technicians: Technician[];
  groups: Group[];
  currentOrderCount: number;
  onAddTasks: (tasks: Omit<Task, 'id'>[]) => Promise<void>;
  onCancel: () => void;
  onCreateGroup?: (name: string, description?: string) => Promise<Group>;
}

// Helper function to map a string priority to the enum
function mapPriorityToPriorityLevel(priority: string | null): PriorityLevel | null {
  if (!priority) return null;
  
  switch (priority.toLowerCase()) {
    case 'low': return PriorityLevel.Low;
    case 'medium': return PriorityLevel.Medium;
    case 'high': return PriorityLevel.High;
    case 'critical': return PriorityLevel.Critical;
    default: return PriorityLevel.Medium;
  }
}

// Helper function to find the best technician match based on name
function findBestTechnicianMatch(name: string | null, technicianList: Technician[]): Technician | null {
  if (!name || !name.trim()) return null;
  
  const normalizedName = name.toLowerCase().trim();
  console.log("Matching technician name:", normalizedName);
  
  // Try exact match first
  const exactMatch = technicianList.find(
    tech => tech.name.toLowerCase().trim() === normalizedName
  );
  if (exactMatch) {
    console.log("Found exact match:", exactMatch.name);
    return exactMatch;
  }
  
  // Try if any technician name contains the input name
  const containsMatch = technicianList.find(
    tech => tech.name.toLowerCase().trim().includes(normalizedName)
  );
  if (containsMatch) {
    console.log("Found contains match:", containsMatch.name);
    return containsMatch;
  }
  
  // Try if the input name contains any technician name
  const reverseContainsMatch = technicianList.find(
    tech => normalizedName.includes(tech.name.toLowerCase().trim())
  );
  if (reverseContainsMatch) {
    console.log("Found reverse contains match:", reverseContainsMatch.name);
    return reverseContainsMatch;
  }
  
  // Try if the input name contains any part (word) of any technician name
  for (const tech of technicianList) {
    const techNameParts = tech.name.toLowerCase().trim().split(/\s+/);
    for (const part of techNameParts) {
      if (normalizedName.includes(part) && part.length > 1) {
        console.log("Found part in name match:", tech.name, "part:", part);
        return tech;
      }
    }
  }
  
  // Try if any part of the input name matches any part of any technician name
  const nameParts = normalizedName.split(/\s+/);
  for (const part of nameParts) {
    if (part.length < 2) continue; // Skip very short parts
    
    const partMatch = technicianList.find(tech => {
      const techParts = tech.name.toLowerCase().trim().split(/\s+/);
      return techParts.some(techPart => techPart.includes(part) || part.includes(techPart));
    });
    
    if (partMatch) {
      console.log("Found name part match:", partMatch.name);
      return partMatch;
    }
  }
  
  console.log("No match found for:", name);
  return null;
}

export function BulkAddTaskAI({ 
  technicians, 
  groups, 
  currentOrderCount, 
  onAddTasks, 
  onCancel,
  onCreateGroup
}: BulkAddTaskAIProps) {
  const [bulkText, setBulkText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State for the parsed tasks
  const [parsedTasks, setParsedTasks] = useState<any[] | null>(null);
  
  // Function to send text to AI for parsing
  const handleAIExtraction = async () => {
    if (!bulkText.trim()) {
      setError('Please enter some text to parse');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Get today's date formatted as YYYY-MM-DD
      const today = new Date();
      const currentDate = today.toISOString().split('T')[0];
      
      // Send the text to the API for parsing
      const response = await fetch('/api/openai/extract-bulk-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: bulkText,
          technicians: technicians.map(tech => ({ id: tech.id, name: tech.name })),
          groups: groups.map(group => ({ id: group.id, name: group.name })),
          currentDate
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to parse tasks');
      }
      
      const extractedTasks = await response.json();
      
      if (!extractedTasks || extractedTasks.length === 0) {
        throw new Error('No tasks could be extracted from the text');
      }
      
      console.log('Extracted tasks:', extractedTasks);
      
      // Convert the extracted tasks to match our internal format and keep the AI response for review
      setParsedTasks(extractedTasks);
    } catch (err: any) {
      console.error('Error extracting tasks:', err);
      setError(err.message || 'An error occurred while parsing tasks');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Function to handle final submission of tasks
  const handleSubmitTasks = async (reviewedTasks: any[]) => {
    try {
      // Map the parsed tasks to our task format
      const taskObjects: Omit<Task, 'id'>[] = reviewedTasks.map((task, index) => {
        // Match assignee name to technician id
        let assigneeId = null;
        if (task.assignee) {
          const matchedTech = findBestTechnicianMatch(task.assignee, technicians);
          if (matchedTech) {
            assigneeId = matchedTech.id;
          }
        }
        
        // Match group name to group id
        let groupId = null;
        if (task.group) {
          const matchedGroup = groups.find(group => group.name.toLowerCase() === task.group.toLowerCase());
          if (matchedGroup) {
            groupId = matchedGroup.id;
          }
        }
        
        // Convert due date string to Timestamp
        let dueDate = null;
        if (task.dueDate) {
          try {
            const date = new Date(task.dueDate);
            if (!isNaN(date.getTime())) {
              dueDate = Timestamp.fromDate(date);
            }
          } catch (e) {
            console.error('Error parsing date:', e);
          }
        }
        
        // Map priority string to enum
        const priorityLevel = mapPriorityToPriorityLevel(task.priority);
        
        return {
          title: task.title,
          explanation: task.details || '',
          status: TaskStatus.Open,
          assigneeId,
          groupId,
          estimatedCompletionDate: dueDate,
          order: currentOrderCount + index,
          priorityLevel,
          tags: [],
          progress: 0,
          lastUpdated: Timestamp.now(),
          externalUrl: task.externalUrl || null,
          ticketNumber: task.ticketNumber || null,
          ticketUrl: null
        };
      });
      
      // Submit the tasks
      await onAddTasks(taskObjects);
    } catch (err: any) {
      console.error('Failed to add tasks:', err);
      setError(err.message || 'Failed to add tasks');
    }
  };
  
  // Reset to the input phase
  const handleBackToInput = () => {
    setParsedTasks(null);
    setError(null);
  };
  
  // Determine which view to show: input or review
  const showInputView = parsedTasks === null;
  
  return (
    <div className="space-y-6 bg-white dark:bg-gray-800 p-4 rounded-md">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800/50 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
      
      {showInputView ? (
        /* Input view - Step 1: Text input for AI parsing */
        <>
          <div>
            <label htmlFor="bulk-text" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Paste your task information below
            </label>
            <textarea
              id="bulk-text"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={10}
              className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              placeholder="Enter task information in any format. Our AI will extract the task titles, details, assignees, due dates, etc."
            ></textarea>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              The AI will extract task information. Include details like titles, descriptions, assignees, due dates, priorities, etc.
            </p>
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
              type="button"
              onClick={handleAIExtraction}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-md text-sm hover:from-blue-600 hover:to-indigo-700 flex items-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting || !bulkText.trim()}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyzing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Analyze with AI
                </>
              )}
            </button>
          </div>
        </>
      ) : (
        /* Review view - Step 2: Review extracted tasks */
        <TaskReviewForm
          parsedTasks={parsedTasks || []}
          technicians={technicians}
          groups={groups}
          onSubmit={handleSubmitTasks}
          onBack={handleBackToInput}
          onCreateGroup={onCreateGroup}
        />
      )}
    </div>
  );
} 