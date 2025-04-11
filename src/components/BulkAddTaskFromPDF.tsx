"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Task, Technician, TaskStatus, Group, PriorityLevel, Category } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { TaskReviewForm } from './TaskReviewForm';

interface BulkAddTaskFromPDFProps {
  technicians: Technician[];
  groups: Group[];
  categories: Category[];
  currentOrderCount: number;
  onAddTasks: (tasks: Omit<Task, 'id'>[]) => Promise<void>;
  onCancel: () => void;
  onCreateGroup?: (name: string, description?: string) => Promise<Group>;
}

export function BulkAddTaskFromPDF({
  technicians,
  groups,
  categories,
  currentOrderCount,
  onAddTasks,
  onCancel,
  onCreateGroup
}: BulkAddTaskFromPDFProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamedOutput, setStreamedOutput] = useState<string>('');
  const [parsedTasks, setParsedTasks] = useState<any[] | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [useThinkingModel, setUseThinkingModel] = useState(false);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [isPaused, setIsPaused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamOutputRef = useRef<HTMLDivElement>(null);
  
  // Function to handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // Validate file type
      if (file.type !== 'application/pdf') {
        setError('Please select a PDF file');
        return;
      }
      
      // Reset state
      setSelectedFile(file);
      setStreamedOutput('');
      setError(null);
    }
  };
  
  // Function to handle file drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      
      // Validate file type
      if (file.type !== 'application/pdf') {
        setError('Please drop a PDF file');
        return;
      }
      
      // Reset state
      setSelectedFile(file);
      setStreamedOutput('');
      setError(null);
    }
  };
  
  // Prevent default behavior for drag events
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  // Process the PDF with Gemini
  const handleAnalyzeDocument = async () => {
    if (!selectedFile) {
      setError('Please select a PDF file');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setStreamedOutput('');
    setUploadProgress(0);
    
    try {
      // Create a FormData object to send the file and context
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('technicians', JSON.stringify(technicians.map(tech => ({ id: tech.id, name: tech.name }))));
      formData.append('groups', JSON.stringify(groups.map(group => ({ id: group.id, name: group.name }))));
      formData.append('categories', JSON.stringify(categories.map(cat => ({ id: cat.id, value: cat.value }))));
      formData.append('useThinkingModel', useThinkingModel.toString());
      
      // Set streaming flag for live updates during processing
      formData.append('streamOutput', 'true');
      
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev < 90) {
            return prev + 10;
          }
          return prev;
        });
      }, 300);
      
      // Send the file to the API for streaming analysis
      const response = await fetch('/api/gemini/extract-tasks-from-pdf', {
        method: 'POST',
        body: formData,
      });
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to analyze document');
      }
      
      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response stream');
      }
      
      // Read the stream
      let receivedText = '';
      
      // Create a function to read and process chunks
      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = new TextDecoder().decode(value);
            receivedText += chunk;
            
            // Update the UI with each received chunk
            setStreamedOutput(prevText => prevText + chunk);
            
            // Force a small delay to ensure React updates the UI
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          return receivedText;
        } catch (error) {
          console.error('Error reading stream:', error);
          throw error;
        }
      };
      
      const completeText = await processStream();
      
      // After streaming completes, try to parse the accumulated JSON
      try {
        // Try to extract the JSON object from the text
        let jsonText = completeText;
        
        // First, let's extract just the JSON part
        // Look for the first opening brace that starts a complete JSON object
        const jsonStartIndex = jsonText.indexOf('{');
        let jsonEndIndex = -1;
        
        if (jsonStartIndex >= 0) {
          // We found a potential JSON object, now find the matching closing brace
          let openBraces = 0;
          for (let i = jsonStartIndex; i < jsonText.length; i++) {
            if (jsonText[i] === '{') openBraces++;
            else if (jsonText[i] === '}') {
              openBraces--;
              if (openBraces === 0) {
                jsonEndIndex = i + 1; // Include the closing brace
                break;
              }
            }
          }
        }
        
        // If we found a complete JSON object, extract just that part
        if (jsonStartIndex >= 0 && jsonEndIndex > jsonStartIndex) {
          jsonText = jsonText.substring(jsonStartIndex, jsonEndIndex);
        } else {
          // Try the regex approach as a fallback
          const jsonMatch = jsonText.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            jsonText = jsonMatch[0];
          }
        }
        
        console.log("Extracted JSON text:", jsonText.substring(0, 100) + "...");
        
        // Now parse the cleaned JSON
        const parsedData = JSON.parse(jsonText);
        
        // Process tasks based on structure
        let extractedTasks = [];
        if (parsedData && parsedData.tasks && Array.isArray(parsedData.tasks)) {
          extractedTasks = parsedData.tasks;
        } else if (Array.isArray(parsedData)) {
          extractedTasks = parsedData;
        } else {
          extractedTasks = [parsedData]; // Fallback to treating the whole object as a single task
        }
        
        if (extractedTasks.length === 0) {
          throw new Error('No tasks could be extracted from the document');
        }
        
        // Process and validate tasks
        const processedTasks = extractedTasks.map((task: any) => ({
          title: task.title || 'Untitled Task',
          details: task.details || '',
          assignee: task.assignee || null,
          group: task.group || null,
          category: task.category || null,
          dueDate: task.dueDate || null,
          priority: task.priority || 'Medium',
          ticketNumber: task.ticketNumber || null,
          externalUrl: task.externalUrl || null
        }));
        
        console.log(`Successfully processed ${processedTasks.length} tasks`);
        setParsedTasks(processedTasks);
        setProcessingComplete(true);
        setCountdown(5);
      } 
      catch (error) {
        console.error('Failed to parse streaming output as JSON, making direct request', error);
        
        try {
          // Create new FormData without streaming flag
          const formDataDirect = new FormData();
          formDataDirect.append('file', selectedFile);
          formDataDirect.append('technicians', JSON.stringify(technicians.map(tech => ({ id: tech.id, name: tech.name }))));
          formDataDirect.append('groups', JSON.stringify(groups.map(group => ({ id: group.id, name: group.name }))));
          formDataDirect.append('categories', JSON.stringify(categories.map(cat => ({ id: cat.id, value: cat.value }))));
          formDataDirect.append('useThinkingModel', useThinkingModel.toString());
          
          // Make direct request
          const directResponse = await fetch('/api/gemini/extract-tasks-from-pdf', {
            method: 'POST',
            body: formDataDirect,
          });
          
          if (!directResponse.ok) {
            const errorData = await directResponse.json();
            throw new Error(errorData.error || errorData.message || 'Failed to analyze document');
          }
          
          let extractedTasks = await directResponse.json();
          
          if (!extractedTasks || extractedTasks.length === 0) {
            throw new Error('No tasks could be extracted from the document');
          }
          
          // Process and validate tasks
          const processedTasks = extractedTasks.map((task: any) => ({
            title: task.title || 'Untitled Task',
            details: task.details || '',
            assignee: task.assignee || null,
            group: task.group || null,
            category: task.category || null,
            dueDate: task.dueDate || null,
            priority: task.priority || 'Medium',
            ticketNumber: task.ticketNumber || null,
            externalUrl: task.externalUrl || null
          }));
          
          setParsedTasks(processedTasks);
          setProcessingComplete(true);
          setCountdown(5);
        } catch (secondError: any) {
          console.error('Error in fallback document analysis:', secondError);
          setError(secondError.message || 'An error occurred while analyzing the document');
          // Don't set processing to false yet to avoid going back to input mode
          setIsProcessing(false);
          // Show a more user-friendly error that stays on screen
          if (streamedOutput) {
            setStreamedOutput(prevOutput => 
              prevOutput + 
              "\n\n❌ ERROR: Failed to extract tasks from the document. Please try again or use a different file."
            );
            // Keep in processing complete state but with error
            setProcessingComplete(true); 
            setCountdown(10); // Give more time to see the error
          }
        }
      }
    } 
    catch (err: any) {
      console.error('Error analyzing document:', err);
      setError(err.message || 'An error occurred while analyzing the document');
    } 
    finally {
      setIsProcessing(false);
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
        
        // Match category value to category id
        let categoryId = null;
        if (task.category) {
          const matchedCategory = categories.find(category => 
            category.value.toLowerCase() === task.category.toLowerCase()
          );
          if (matchedCategory) {
            categoryId = matchedCategory.id;
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
          categoryId,
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
      
      // Close the modal after successful submission
      onCancel();
    } catch (err: any) {
      console.error('Failed to add tasks:', err);
      setError(err.message || 'Failed to add tasks');
    }
  };
  
  // Reset to the input phase
  const handleBackToInput = () => {
    setParsedTasks(null);
    setStreamedOutput('');
    setError(null);
  };
  
  // Helper function to map a technician's name to a technician object
  const findBestTechnicianMatch = (name: string, technicians: Technician[]): Technician | null => {
    if (!name) return null;
    
    const normalizedName = name.toLowerCase().trim();
    
    // Try exact match
    const exactMatch = technicians.find(tech => 
      tech.name.toLowerCase().trim() === normalizedName
    );
    if (exactMatch) return exactMatch;
    
    // Try partial match
    const partialMatch = technicians.find(tech => 
      tech.name.toLowerCase().includes(normalizedName) || 
      normalizedName.includes(tech.name.toLowerCase())
    );
    if (partialMatch) return partialMatch;
    
    return null;
  };
  
  // Helper function to map priority string to PriorityLevel enum
  const mapPriorityToPriorityLevel = (priority: string | null): PriorityLevel => {
    if (!priority) return PriorityLevel.Medium;
    
    switch (priority.toLowerCase()) {
      case 'low':
        return PriorityLevel.Low;
      case 'medium':
        return PriorityLevel.Medium;
      case 'high':
        return PriorityLevel.High;
      case 'critical':
        return PriorityLevel.Critical;
      default:
        return PriorityLevel.Medium;
    }
  };
  
  // Effect to auto-scroll the streaming output container to the bottom when content is added
  useEffect(() => {
    if (streamOutputRef.current && streamedOutput) {
      streamOutputRef.current.scrollTop = streamOutputRef.current.scrollHeight;
    }
  }, [streamedOutput]);
  
  // Countdown effect after processing completes
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (processingComplete && countdown > 0 && !isPaused) {
      timer = setTimeout(() => {
        setCountdown(prevCount => prevCount - 1);
      }, 1000);
    } else if (processingComplete && countdown === 0) {
      // Automatically proceed to review when countdown reaches zero
      setProcessingComplete(false);
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [processingComplete, countdown, isPaused]);
  
  // Toggle countdown pause
  const toggleCountdown = () => {
    setIsPaused(!isPaused);
  };
  
  // Determine which view to show: input, processing, complete, or review
  const showInputView = !parsedTasks && !isProcessing && !processingComplete;
  const showProcessingView = isProcessing;
  const showProcessingCompleteView = processingComplete && parsedTasks !== null;
  const showReviewView = !isProcessing && !processingComplete && parsedTasks !== null;
  
  // Function to toggle the thinking model
  const toggleThinkingModel = () => {
    const newValue = !useThinkingModel;
    setUseThinkingModel(newValue);
    
    // Show a confirmation message
    const message = document.createElement('div');
    message.className = `fixed top-4 right-4 px-4 py-2 rounded-md text-white text-sm transition-opacity ${newValue ? 'bg-purple-600' : 'bg-blue-600'}`;
    message.textContent = newValue ? '✓ Gemini Thinking Model enabled' : '✓ Standard model selected';
    document.body.appendChild(message);
    
    // Remove the message after a delay
    setTimeout(() => {
      message.style.opacity = '0';
      setTimeout(() => document.body.removeChild(message), 500);
    }, 1500);
  };
  
  // Handler to proceed to review form
  const handleProceedToReview = () => {
    setProcessingComplete(false);
  };
  
  return (
    <div className="space-y-4 bg-white dark:bg-gray-800 rounded-md">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800/50 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
      
      {showInputView && (
        /* Input view - Step 1: PDF upload */
        <div className="space-y-4">
          <div>
            <label htmlFor="pdf-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Upload PDF Document
            </label>
            
            {/* File drop zone */}
            <div 
              className={`border-2 border-dashed rounded-lg p-6 text-center ${
                selectedFile 
                  ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20' 
                  : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600'
              } transition-colors cursor-pointer`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                id="pdf-upload"
                ref={fileInputRef}
                accept="application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              
              {selectedFile ? (
                <div className="flex flex-col items-center">
                  <svg className="w-8 h-8 text-green-500 dark:text-green-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <svg className="w-10 h-10 text-gray-400 dark:text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Drag and drop your PDF here, or click to browse</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    PDF files only, max 10MB
                  </p>
                </div>
              )}
            </div>
            
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Upload a PDF document such as meeting minutes, project plans, or emails that contain tasks. 
              Our AI will analyze the document and extract possible tasks.
            </p>
          </div>
          
          {/* Thinking model toggle */}
          <div className="flex items-center">
            <label htmlFor="thinking-model-toggle" className="flex items-center cursor-pointer">
              <div className="relative inline-flex items-center">
                <input 
                  type="checkbox" 
                  id="thinking-model-toggle" 
                  className="sr-only"
                  checked={useThinkingModel}
                  onChange={toggleThinkingModel} 
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${useThinkingModel ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <div className={`transform transition-transform duration-200 ease-in-out h-5 w-5 rounded-full bg-white border border-gray-300 inline-block ${useThinkingModel ? 'translate-x-6' : 'translate-x-1'}`} style={{marginTop: '2px'}}></div>
                </div>
                <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">
                  Use Gemini Thinking Model
                </span>
              </div>
            </label>
            <div className="relative ml-2 group">
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                aria-label="More information about thinking model"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="absolute hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 z-10 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-60">
                Uses Gemini 2.5 Pro's enhanced reasoning capabilities for better task extraction. May improve accuracy for complex documents.
                <div className="absolute left-1/2 transform -translate-x-1/2 top-full">
                  <div className="w-2 h-2 bg-black rotate-45"></div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAnalyzeDocument}
              className={`px-4 py-2 bg-gradient-to-r ${
                useThinkingModel 
                  ? 'from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800' 
                  : 'from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
              } text-white rounded-md text-sm shadow-md disabled:opacity-50 flex items-center`}
              disabled={!selectedFile || isProcessing}
            >
              {useThinkingModel ? (
                <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.04Z"></path>
                  <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.04Z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v11.5A2.25 2.25 0 0115.75 18H4.25A2.25 2.25 0 012 15.75V4.25z" />
                  <path d="M9 5a1 1 0 012 0v6a1 1 0 01-1 1H5a1 1 0 010-2h4V5z" />
                </svg>
              )}
              Analyze with {useThinkingModel ? "Gemini Thinking" : "Gemini"}
            </button>
          </div>
        </div>
      )}
      
      {showProcessingView && (
        /* Processing view - Step 2: Showing analysis progress */
        <div className="flex flex-col items-center space-y-4 py-6">
          {/* Loading animation */}
          <div className="relative w-32 h-32">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`w-20 h-20 border-b-4 border-l-4 ${useThinkingModel ? 'border-purple-500' : 'border-blue-500'} rounded-full animate-spin`}></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`w-16 h-16 border-t-4 border-r-4 ${useThinkingModel ? 'border-indigo-600' : 'border-indigo-500'} rounded-full animate-spin-slow`}></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className={`w-12 h-12 ${useThinkingModel ? 'text-purple-600 dark:text-purple-400' : 'text-blue-600 dark:text-blue-400'}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {useThinkingModel ? (
                  // Brain icon for thinking model
                  <>
                    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.04Z"></path>
                    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.04Z"></path>
                  </>
                ) : (
                  // Clock icon for standard model
                  <>
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 6v6l4 2"></path>
                  </>
                )}
              </svg>
            </div>
          </div>
          
          {/* Processing label */}
          <div className="text-center">
            <h3 className={`text-lg font-medium ${useThinkingModel ? 'text-purple-600 dark:text-purple-400' : 'text-blue-600 dark:text-blue-400'}`}>
              {useThinkingModel ? 'Thinking deeply about your document...' : 'Analyzing your document...'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {useThinkingModel 
                ? 'Using enhanced reasoning capabilities to extract tasks with higher accuracy' 
                : 'Extracting tasks from your document'}
            </p>
          </div>
          
          {/* Progress bar */}
          <div className="w-full max-w-md">
            <div className="relative pt-1">
              <div className="overflow-hidden h-2 mb-2 text-xs flex rounded-full bg-gray-200 dark:bg-gray-700">
                <div 
                  style={{ width: `${uploadProgress}%` }} 
                  className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${
                    useThinkingModel 
                      ? 'bg-gradient-to-r from-purple-500 to-indigo-600' 
                      : 'bg-gradient-to-r from-blue-500 to-indigo-600'
                  } transition-all duration-300`}
                ></div>
              </div>
              <div className="text-center text-sm text-gray-600 dark:text-gray-300">
                {uploadProgress < 100 ? 'Uploading document...' : 'Analyzing document...'}
              </div>
            </div>
          </div>
          
          {/* Streamed output display */}
          {streamedOutput && (
            <div className="w-full mt-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                <span className={`inline-block h-2 w-2 rounded-full ${useThinkingModel ? 'bg-purple-500' : 'bg-green-500'} animate-pulse mr-2`}></span>
                {useThinkingModel ? 'Thinking in progress:' : 'Analysis in progress:'}
              </h3>
              <div 
                ref={streamOutputRef}
                className={`bg-gray-50 dark:bg-gray-900 border-2 ${
                  useThinkingModel 
                    ? 'border-purple-200 dark:border-purple-800' 
                    : 'border-gray-200 dark:border-gray-800'
                } rounded-lg p-4 h-64 overflow-auto font-mono text-xs relative`}
              >
                {streamedOutput.split('\n').map((line, i) => (
                  <div key={i} className={`leading-relaxed ${i === streamedOutput.split('\n').length - 1 ? `${useThinkingModel ? 'text-purple-600 dark:text-purple-400' : 'text-green-600 dark:text-green-400'} font-semibold animate-pulse` : ''}`}>
                    {line || <br />}
                  </div>
                ))}
                <div className="h-4"></div> {/* Extra space to ensure auto-scroll works */}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
                Gemini {useThinkingModel ? 'Thinking' : 'AI'} is analyzing your document and extracting tasks in real-time
              </p>
            </div>
          )}
          
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 mt-4 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
      
      {showProcessingCompleteView && (
        /* Processing complete view - Step 3: Show completion with countdown */
        <div className="flex flex-col items-center space-y-4 py-6">
          <div className={`w-20 h-20 ${
            error 
              ? 'bg-red-100 dark:bg-red-900/30' 
              : useThinkingModel 
                ? 'bg-purple-100 dark:bg-purple-900/30' 
                : 'bg-green-100 dark:bg-green-900/30'
          } rounded-full flex items-center justify-center`}>
            {error ? (
              <svg className="w-10 h-10 text-red-600 dark:text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : useThinkingModel ? (
              <svg className="w-10 h-10 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.04Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.04Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg className="w-10 h-10 text-green-600 dark:text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          
          <div className="text-center">
            <h3 className={`text-lg font-medium ${
              error 
                ? 'text-red-600 dark:text-red-400' 
                : useThinkingModel 
                  ? 'text-purple-600 dark:text-purple-400' 
                  : 'text-green-600 dark:text-green-400'
            }`}>
              {error 
                ? 'Error Processing Document' 
                : useThinkingModel 
                  ? 'Thinking Analysis Complete!' 
                  : 'Document Analysis Complete!'
              }
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {error 
                ? error 
                : `We found ${parsedTasks?.length || 0} tasks in your document using
                   ${useThinkingModel ? ' Gemini Thinking with enhanced reasoning' : ' Gemini standard analysis'}.`
              }
            </p>
          </div>
          
          {/* Analysis output display */}
          <div className="w-full mt-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
              <span className={`inline-block h-2 w-2 rounded-full ${
                error 
                  ? 'bg-red-500' 
                  : useThinkingModel 
                    ? 'bg-purple-500' 
                    : 'bg-green-500'
              } mr-2`}></span>
              {error 
                ? 'Error Details:' 
                : useThinkingModel 
                  ? 'Gemini Thinking output:' 
                  : 'Analysis output:'
              }
            </h3>
            <div 
              ref={streamOutputRef}
              className={`bg-gray-50 dark:bg-gray-900 border-2 ${
                error
                  ? 'border-red-200 dark:border-red-800'
                  : useThinkingModel 
                    ? 'border-purple-200 dark:border-purple-800' 
                    : 'border-gray-200 dark:border-gray-800'
              } rounded-lg p-4 h-64 overflow-auto font-mono text-xs relative`}
            >
              {streamedOutput.split('\n').map((line, i) => (
                <div key={i} className={`leading-relaxed ${
                  line.includes('ERROR:') 
                    ? 'text-red-600 dark:text-red-400 font-semibold' 
                    : i === streamedOutput.split('\n').length - 1 && !error 
                      ? `${useThinkingModel ? 'text-purple-600 dark:text-purple-400' : 'text-green-600 dark:text-green-400'} font-semibold animate-pulse` 
                      : ''
                }`}>
                  {line || <br />}
                </div>
              ))}
            </div>
            {!error && (
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                  Proceeding to task review in <span className="font-medium">{countdown}</span> {countdown === 1 ? 'second' : 'seconds'}...
                </p>
                <button
                  type="button"
                  onClick={toggleCountdown}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {isPaused ? 'Resume countdown' : 'Pause countdown'}
                </button>
              </div>
            )}
          </div>
          
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            {error ? (
              <button
                type="button"
                onClick={handleBackToInput}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm shadow flex items-center"
              >
                <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                Try Again
              </button>
            ) : (
              <button
                type="button"
                onClick={handleProceedToReview}
                className={`px-4 py-2 ${
                  useThinkingModel 
                    ? 'bg-purple-600 hover:bg-purple-700' 
                    : 'bg-blue-600 hover:bg-blue-700'
                } text-white rounded-md text-sm shadow flex items-center`}
              >
                <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Continue to Review
              </button>
            )}
          </div>
        </div>
      )}
      
      {showReviewView && parsedTasks && (
        <TaskReviewForm
          parsedTasks={parsedTasks}
          technicians={technicians}
          groups={groups}
          categories={categories}
          onSubmit={handleSubmitTasks}
          onBack={handleBackToInput}
          onCreateGroup={onCreateGroup}
          isThinkingModel={useThinkingModel}
        />
      )}
    </div>
  );
} 