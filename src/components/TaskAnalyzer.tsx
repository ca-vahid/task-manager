'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Task, Technician, Group, Category, TaskStatus } from '@/lib/types';

interface TaskAnalyzerProps {
  tasks: Task[];
  technicians: Technician[];
  groups: Group[];
  categories: Category[];
  onMergeTasks: (tasksToMerge: {
    taskIds: string[];
    mergedTask: Partial<Task>;
  }[]) => Promise<void>;
  onCancel: () => void;
}

interface HighlightedOutputProps {
  text: string;
}

function HighlightedOutput({ text }: HighlightedOutputProps) {
  // Function to detect and highlight JSON in the output
  const highlightJson = (input: string): JSX.Element[] => {
    // Split by objects or arrays with a simpler regex that works in all environments
    const parts = input.split(/(\{[^{}]*\}|\[[^\[\]]*\])/);
    
    return parts.map((part, index) => {
      // Check if this part looks like JSON
      if ((part.startsWith('{') && part.endsWith('}')) || (part.startsWith('[') && part.endsWith(']'))) {
        try {
          // Try to parse it to confirm it's valid JSON
          JSON.parse(part);
          // If it parsed, return it with JSON highlighting
          return (
            <span key={index} className="text-blue-500 dark:text-blue-400 font-mono">
              {part}
            </span>
          );
        } catch (e) {
          // If it didn't parse, treat it as regular text
          return <span key={index}>{part}</span>;
        }
      }
      
      // Highlight system messages
      if (part.includes('[System:') && part.includes(']')) {
        return (
          <span key={index} className="text-green-600 dark:text-green-400 font-semibold">
            {part}
          </span>
        );
      }
      
      // Default: regular text
      return <span key={index}>{part}</span>;
    });
  };
  
  return <>{highlightJson(text)}</>;
}

export function TaskAnalyzer({
  tasks,
  technicians,
  groups,
  categories,
  onMergeTasks,
  onCancel
}: TaskAnalyzerProps) {
  // View states
  const [isProcessing, setIsProcessing] = useState(false);
  const [optimizationComplete, setOptimizationComplete] = useState(false);
  const [showProcessingView, setShowProcessingView] = useState(true);
  const [showMergeConfirmationView, setShowMergeConfirmationView] = useState(false);
  
  // Model selection
  const [useThinkingModel, setUseThinkingModel] = useState(false);
  
  // Progress tracking
  const [uploadProgress, setUploadProgress] = useState(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Add process stage tracking
  const [currentProcessStage, setCurrentProcessStage] = useState<'idle' | 'initializing' | 'analyzing' | 'processing' | 'complete'>('idle');
  const [processingStages, setProcessingStages] = useState<{stage: string, percent: number}[]>([
    { stage: 'Initializing Analysis', percent: 15 },
    { stage: 'Analyzing Tasks', percent: 60 },
    { stage: 'Processing Results', percent: 95 },
    { stage: 'Complete', percent: 100 },
  ]);
  
  // Analysis output
  const [streamedOutput, setStreamedOutput] = useState('');
  const streamOutputRef = useRef<HTMLDivElement>(null);
  
  // Analysis results
  const [error, setError] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<any | null>(null);
  
  // Merge selections
  const [selectedDuplicateMerges, setSelectedDuplicateMerges] = useState<Record<string, boolean>>({});
  const [selectedSimilarMerges, setSelectedSimilarMerges] = useState<Record<string, boolean>>({});
  
  // Toggle thinking model
  const toggleThinkingModel = () => {
    setUseThinkingModel(!useThinkingModel);
    // Update stage percentages based on model
    setProcessingStages([
      { stage: 'Initializing Analysis', percent: 15 },
      { stage: 'Analyzing Tasks', percent: useThinkingModel ? 40 : 60 }, // Thinking model takes longer
      { stage: 'Processing Results', percent: useThinkingModel ? 85 : 95 },
      { stage: 'Complete', percent: 100 },
    ]);
  };
  
  // Function to make progress bar continuously increase during long operations
  const useProgressIncrementer = (currentStage: string, currentProgress: number) => {
    useEffect(() => {
      let incrementInterval: NodeJS.Timeout | undefined;
      
      // Find the target percentage for the current stage
      const currentStageInfo = processingStages.find(stage => 
        stage.stage.toLowerCase().includes(currentStage.toLowerCase()));
      const currentTarget = currentStageInfo?.percent || 0;
      
      // Calculate the previous stage's ending percentage
      const previousStageIndex = processingStages.findIndex(stage => 
        stage.stage.toLowerCase().includes(currentStage.toLowerCase())) - 1;
      const previousPercent = previousStageIndex >= 0 ? processingStages[previousStageIndex].percent : 0;
      
      // Only increment if we're in an active stage and not at target
      if (currentStage !== 'complete' && currentStage !== 'idle' && currentProgress < currentTarget) {
        // Calculate increment based on model type
        const incrementSize = useThinkingModel ? 0.15 : 0.3;
        const intervalTime = useThinkingModel ? 400 : 300;
        
        incrementInterval = setInterval(() => {
          setUploadProgress(prev => {
            // Don't increment past the target
            if (prev >= currentTarget) return prev;
            
            // Calculate how far we are through the current stage (as a percentage)
            const stageProgress = (prev - previousPercent) / (currentTarget - previousPercent);
            
            // As we get closer to the target, make increments smaller
            const dynamicIncrement = stageProgress > 0.7 ? incrementSize * 0.5 :
                                    stageProgress > 0.5 ? incrementSize * 0.7 :
                                    incrementSize;
                                    
            return Math.min(prev + dynamicIncrement, currentTarget);
          });
        }, intervalTime);
      }
      
      // Cleanup
      return () => {
        if (incrementInterval) clearInterval(incrementInterval);
      };
    }, [currentStage, currentProgress, processingStages, useThinkingModel]);
  };
  
  // Apply the progress increments
  useProgressIncrementer(currentProcessStage, uploadProgress);
  
  // Scroll output to bottom when new content is added
  useEffect(() => {
    if (streamOutputRef.current) {
      streamOutputRef.current.scrollTop = streamOutputRef.current.scrollHeight;
    }
  }, [streamedOutput]);
  
  // Clean up progress interval on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);
  
  // Start the analysis process
  const handleAnalyzeTasks = async () => {
    setIsProcessing(true);
    setCurrentProcessStage('initializing');
    setUploadProgress(1); // Start at a small value
    setStreamedOutput('');
    setError(null);
    setAnalysisResults(null);
    
    try {
      // After a short delay, transition to analyzing stage
      setTimeout(() => {
        setCurrentProcessStage('analyzing');
      }, useThinkingModel ? 4000 : 2000);
      
      // Send the tasks to the API for analysis
      const response = await fetch('/api/gemini/analyze-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tasks,
          useThinkingModel,
        }),
      });
      
      // Move to processing stage
      setCurrentProcessStage('processing');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to analyze tasks');
      }
      
      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response stream');
      }
      
      // Read the stream
      let receivedText = '';
      
      // Process the stream chunks
      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              break;
            }
            
            // Decode the chunk and add to the streamed output
            const chunk = new TextDecoder().decode(value);
            receivedText += chunk;
            setStreamedOutput(receivedText);
            
            // Check for completion markers in the text
            if (chunk.includes('Analysis complete')) {
              setCurrentProcessStage('complete');
            }
          }
          
          // Try to extract JSON from the streamed output
          const analysisData = extractJsonFromText(receivedText);
          if (analysisData) {
            setAnalysisResults(analysisData);
            
            // Initialize all merge selections to false
            if (analysisData.analysis) {
              const initialDuplicateSelections: Record<string, boolean> = {};
              const initialSimilarSelections: Record<string, boolean> = {};
              
              if (analysisData.analysis.duplicates) {
                analysisData.analysis.duplicates.forEach((group: any, index: number) => {
                  initialDuplicateSelections[index] = false;
                });
              }
              
              if (analysisData.analysis.similar) {
                analysisData.analysis.similar.forEach((group: any, index: number) => {
                  initialSimilarSelections[index] = false;
                });
              }
              
              setSelectedDuplicateMerges(initialDuplicateSelections);
              setSelectedSimilarMerges(initialSimilarSelections);
            }
          }
          
          // Set to complete at the end
          setCurrentProcessStage('complete');
          setUploadProgress(100);
          setOptimizationComplete(true);
        } catch (err) {
          console.error('Error processing stream:', err);
          setError(`Error processing stream: ${err}`);
        }
      };
      
      // Process the stream
      await processStream();
      
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.message || 'An error occurred during analysis');
      setCurrentProcessStage('idle');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Extract JSON from text that may contain other content
  const extractJsonFromText = (text: string): any | null => {
    try {
      // Try to parse the entire text as JSON first
      return JSON.parse(text);
    } catch (e) {
      // If that fails, try to find JSON objects in the text
      const jsonRegex = /\{(?:[^{}]|(\{(?:[^{}]|(\{(?:[^{}]|(\{[^{}]*\}))*\}))*\}))*\}/g;
      const matches = text.match(jsonRegex);
      
      if (matches && matches.length > 0) {
        // Try parsing each match
        for (const match of matches) {
          try {
            const parsed = JSON.parse(match);
            // Look for the expected structure
            if (parsed.analysis && 
                (parsed.analysis.duplicates || parsed.analysis.similar)) {
              return parsed;
            }
          } catch (e) {
            // Ignore parse errors for individual matches
          }
        }
      }
      
      return null;
    }
  };
  
  // Proceed to merge confirmation view
  const confirmAnalysisAndProceed = () => {
    setShowProcessingView(false);
    setShowMergeConfirmationView(true);
  };
  
  // Go back to processing view
  const goBackToProcessing = () => {
    setShowProcessingView(true);
    setShowMergeConfirmationView(false);
  };
  
  // Cancel the entire operation
  const cancelAnalysis = () => {
    onCancel();
  };
  
  // Toggle selection for a duplicate merge
  const toggleDuplicateMergeSelection = (index: number) => {
    setSelectedDuplicateMerges(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };
  
  // Toggle selection for a similar merge
  const toggleSimilarMergeSelection = (index: number) => {
    setSelectedSimilarMerges(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };
  
  // Apply the selected merges
  const applySelectedMerges = async () => {
    if (!analysisResults) {
      return;
    }
    
    try {
      setIsProcessing(true);
      
      const mergesToApply: {
        taskIds: string[];
        mergedTask: Partial<Task>;
      }[] = [];
      
      // Process selected duplicate merges
      if (analysisResults.analysis.duplicates) {
        analysisResults.analysis.duplicates.forEach((group: any, index: number) => {
          if (selectedDuplicateMerges[index] && group.recommendedAction === 'merge') {
            mergesToApply.push({
              taskIds: group.tasks,
              mergedTask: {
                title: group.mergedTask.title,
                explanation: group.mergedTask.details,
                assigneeId: findTechnicianIdImproved(group.mergedTask.assignee),
                groupId: findGroupIdImproved(group.mergedTask.group),
                categoryId: findCategoryIdImproved(group.mergedTask.category),
                status: mapPriorityToStatus(group.mergedTask.priority)
              }
            });
          }
        });
      }
      
      // Process selected similar merges
      if (analysisResults.analysis.similar) {
        analysisResults.analysis.similar.forEach((group: any, index: number) => {
          if (selectedSimilarMerges[index] && group.recommendedAction === 'merge') {
            mergesToApply.push({
              taskIds: group.tasks,
              mergedTask: {
                title: group.mergedTask.title,
                explanation: group.mergedTask.details,
                assigneeId: findTechnicianIdImproved(group.mergedTask.assignee),
                groupId: findGroupIdImproved(group.mergedTask.group),
                categoryId: findCategoryIdImproved(group.mergedTask.category),
                status: mapPriorityToStatus(group.mergedTask.priority)
              }
            });
          }
        });
      }
      
      // Apply the merges
      if (mergesToApply.length > 0) {
        await onMergeTasks(mergesToApply);
      }
      
      // Close the analyzer
      onCancel();
    } catch (err: any) {
      console.error('Error applying merges:', err);
      setError(err.message || 'An error occurred while applying merges');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Improved helper functions that can handle either IDs or names
  
  // Helper function to find technician ID by name or return the ID if it's already an ID
  const findTechnicianIdImproved = (nameOrId: string | null): string | null => {
    if (!nameOrId) return null;
    
    // First check if nameOrId is already a valid ID in our technicians array
    const techById = technicians.find(tech => tech.id === nameOrId);
    if (techById) return nameOrId;
    
    // If not, try to find by name
    const techByName = technicians.find(
      tech => tech.name.toLowerCase() === nameOrId.toLowerCase()
    );
    return techByName ? techByName.id : null;
  };
  
  // Helper function to find group ID by name or return the ID if it's already an ID
  const findGroupIdImproved = (nameOrId: string | null): string | null => {
    if (!nameOrId) return null;
    
    // First check if nameOrId is already a valid ID in our groups array
    const groupById = groups.find(group => group.id === nameOrId);
    if (groupById) return nameOrId;
    
    // If not, try to find by name
    const groupByName = groups.find(
      group => group.name.toLowerCase() === nameOrId.toLowerCase()
    );
    return groupByName ? groupByName.id : null;
  };
  
  // Helper function to find category ID by value or return the ID if it's already an ID
  const findCategoryIdImproved = (valueOrId: string | null): string | null => {
    if (!valueOrId) return null;
    
    // First check if valueOrId is already a valid ID in our categories array
    const categoryById = categories.find(cat => cat.id === valueOrId);
    if (categoryById) return valueOrId;
    
    // If not, try to find by value
    const categoryByValue = categories.find(
      cat => cat.value.toLowerCase() === valueOrId.toLowerCase()
    );
    return categoryByValue ? categoryByValue.id : null;
  };
  
  // Helper function to map priority to status
  const mapPriorityToStatus = (priority: string | null): TaskStatus => {
    if (!priority) return TaskStatus.Open;
    
    switch (priority) {
      case 'Critical':
        return TaskStatus.Pending;
      case 'High':
        return TaskStatus.Pending;
      default:
        return TaskStatus.Open;
    }
  };
  
  // Helper function to get task identifier for display
  const getTaskIdentifier = (taskId: string): string => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return `Task ${taskId.substring(0, 6)}...`;
    
    // If task has a ticket number, use that
    if (task.ticketNumber) {
      return `#${task.ticketNumber}: ${task.title.substring(0, 30)}${task.title.length > 30 ? '...' : ''}`;
    }
    
    // Otherwise use the task title with truncation if needed
    return `${task.title.substring(0, 40)}${task.title.length > 40 ? '...' : ''}`;
  };
  
  // Count the number of selected merges
  const selectedMergeCount = () => {
    let count = 0;
    
    Object.values(selectedDuplicateMerges).forEach(selected => {
      if (selected) count++;
    });
    
    Object.values(selectedSimilarMerges).forEach(selected => {
      if (selected) count++;
    });
    
    return count;
  };
  
  // Check if there are any available merge suggestions
  const hasMergeSuggestions = (): boolean => {
    if (!analysisResults || !analysisResults.analysis) return false;
    
    const hasDuplicates = analysisResults.analysis.duplicates && 
      analysisResults.analysis.duplicates.length > 0;
    
    const hasSimilar = analysisResults.analysis.similar && 
      analysisResults.analysis.similar.length > 0;
    
    return hasDuplicates || hasSimilar;
  };
  
  // When displaying task reasons in the UI, replace any mentions of task IDs with human-readable identifiers
  const humanizeTaskReferences = (text: string): string => {
    // Don't process if there's no text or no tasks
    if (!text || !tasks || tasks.length === 0) return text;
    
    let result = text;
    
    // Replace any mention of task IDs with human-readable identifiers
    tasks.forEach(task => {
      if (result.includes(task.id)) {
        const identifier = getTaskIdentifier(task.id);
        result = result.replace(new RegExp(task.id, 'g'), `"${identifier}"`);
      }
    });
    
    return result;
  };
  
  // Bulk select all or none
  const selectAllDuplicates = (select: boolean) => {
    if (!analysisResults?.analysis?.duplicates) return;
    
    const newSelections: Record<string, boolean> = {};
    analysisResults.analysis.duplicates.forEach((group: any, index: number) => {
      if (group.recommendedAction === 'merge') {
        newSelections[index] = select;
      }
    });
    
    setSelectedDuplicateMerges(prev => ({
      ...prev,
      ...newSelections
    }));
  };
  
  const selectAllSimilar = (select: boolean) => {
    if (!analysisResults?.analysis?.similar) return;
    
    const newSelections: Record<string, boolean> = {};
    analysisResults.analysis.similar.forEach((group: any, index: number) => {
      if (group.recommendedAction === 'merge') {
        newSelections[index] = select;
      }
    });
    
    setSelectedSimilarMerges(prev => ({
      ...prev,
      ...newSelections
    }));
  };
  
  // Count merge-eligible suggestions
  const countMergeEligibleDuplicates = (): number => {
    if (!analysisResults?.analysis?.duplicates) return 0;
    return analysisResults.analysis.duplicates.filter((group: any) => group.recommendedAction === 'merge').length;
  };
  
  const countMergeEligibleSimilar = (): number => {
    if (!analysisResults?.analysis?.similar) return 0;
    return analysisResults.analysis.similar.filter((group: any) => group.recommendedAction === 'merge').length;
  };
  
  return (
    <div className="max-h-[70vh] overflow-y-auto py-4">
      {showProcessingView && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            {optimizationComplete ? (
              <svg className="h-5 w-5 text-green-500 dark:text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="animate-spin h-5 w-5 text-blue-500 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              {optimizationComplete ? 'Analysis Complete!' : 'Analyzing Tasks...'}
            </h3>
          </div>
          
          {/* Progress bar with stage information */}
          <div className="w-full space-y-1 mb-4">
            <div className="mb-1 flex justify-between items-center">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {currentProcessStage === 'idle' && 'Select Model and Start Analysis'}
                {currentProcessStage === 'initializing' && 'Initializing Analysis'}
                {currentProcessStage === 'analyzing' && 'Analyzing Tasks'}
                {currentProcessStage === 'processing' && 'Processing Results'}
                {currentProcessStage === 'complete' && 'Processing Complete'}
              </div>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {Math.round(uploadProgress)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
              <div 
                className={`h-2 rounded-full ${
                  useThinkingModel ? 'bg-purple-500 dark:bg-purple-400' : 'bg-blue-500 dark:bg-blue-400'
                } transition-all duration-500 ease-out`}
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
          
          {/* Thinking model toggle */}
          {!isProcessing && !optimizationComplete && (
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
                  Uses Gemini 2.5 Pro&apos;s enhanced reasoning capabilities for better task analysis. Shows reasoning steps during analysis.
                  <div className="absolute left-1/2 transform -translate-x-1/2 top-full">
                    <div className="w-2 h-2 bg-black rotate-45"></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Output display */}
          <div>
            <div
              ref={streamOutputRef}
              className={`font-mono text-sm overflow-auto max-h-96 p-4 border ${
                useThinkingModel 
                  ? 'border-purple-200 dark:border-purple-800' 
                  : 'border-gray-200 dark:border-gray-800'
              } rounded-lg bg-white dark:bg-gray-900 whitespace-pre-wrap`}
            >
              <HighlightedOutput text={streamedOutput} />
              <div className="h-4"></div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
              {optimizationComplete 
                ? 'Analysis complete. Review the output above before continuing.'
                : `Gemini ${useThinkingModel ? 'Thinking' : 'AI'} is analyzing your tasks in real-time`}
            </p>
          </div>
          
          {/* Error display */}
          {error && (
            <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md border border-red-200 dark:border-red-800/50 text-sm">
              {error}
            </div>
          )}
          
          {/* Action buttons */}
          <div className="flex justify-between mt-4">
            <button
              type="button"
              onClick={cancelAnalysis}
              className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              disabled={isProcessing}
            >
              Cancel
            </button>
            
            {!isProcessing && !optimizationComplete && (
              <button
                onClick={handleAnalyzeTasks}
                className={`px-4 py-2 bg-gradient-to-r ${
                  useThinkingModel 
                    ? 'from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800' 
                    : 'from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                } text-white rounded-md text-sm shadow-md disabled:opacity-50 flex items-center`}
              >
                {useThinkingModel ? (
                  <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.04Z"></path>
                    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.04Z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                )}
                Analyze with {useThinkingModel ? "Gemini Thinking" : "Gemini"}
              </button>
            )}
            
            {optimizationComplete && analysisResults && (
              <button
                onClick={confirmAnalysisAndProceed}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                disabled={isProcessing}
              >
                Review Merge Suggestions
              </button>
            )}
          </div>
        </div>
      )}
      
      {showMergeConfirmationView && analysisResults && (
        <div className="space-y-6">
          <div className="mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              Task Merge Suggestions
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Review and select which tasks to merge based on the AI analysis. 
              Select the recommendations you want to apply.
            </p>
          </div>
          
          {/* Duplicate tasks section */}
          {analysisResults.analysis.duplicates && analysisResults.analysis.duplicates.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-md font-medium text-gray-800 dark:text-gray-200 flex items-center">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-2"></span>
                Duplicate Tasks ({analysisResults.analysis.duplicates.length})
                {/* AI Recommendation Indicator */}
                <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 py-0.5 px-2 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" className="inline-block h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI: {countMergeEligibleDuplicates()} suggested merges
                </span>
              </h4>
              
              {/* Bulk action controls for duplicates */}
              {countMergeEligibleDuplicates() > 3 && (
                <div className="flex justify-end space-x-2 mb-2">
                  <button 
                    onClick={() => selectAllDuplicates(true)}
                    className="text-xs bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-800/40 text-blue-700 dark:text-blue-300 px-2 py-1 rounded transition-colors"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => selectAllDuplicates(false)}
                    className="text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              )}
              
              <div className="space-y-4">
                {analysisResults.analysis.duplicates.map((group: any, index: number) => (
                  <div 
                    key={`duplicate-${index}`} 
                    className={`border rounded-md p-4 ${
                      selectedDuplicateMerges[index]
                        ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {/* Keep Separate case - show a simple header */}
                    {group.recommendedAction !== 'merge' && (
                      <>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-2">
                            <div className="pt-0.5">
                              <input
                                type="checkbox"
                                disabled={true}
                                className="h-4 w-4 text-gray-400 rounded focus:ring-gray-500 border-gray-300 cursor-not-allowed"
                              />
                            </div>
                            <div>
                              <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                {group.tasks.length} similar tasks
                              </span>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {humanizeTaskReferences(group.reason)}
                              </p>
                            </div>
                          </div>
                          <div className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                            Keep Separate
                          </div>
                        </div>
                        
                        {/* Task details list */}
                        <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Tasks to keep separate:
                          </div>
                          <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
                            {group.tasks.map((taskId: string, taskIndex: number) => {
                              const task = tasks.find(t => t.id === taskId);
                              return task ? (
                                <div key={taskId} className="text-sm border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0">
                                  <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                                    {/* Master Task Indicator */}
                                    {taskIndex === 0 && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Master
                                      </span>
                                    )}
                                    
                                    {/* FreshService Ticket Indicator */}
                                    {task.ticketNumber && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                                        </svg>
                                        Ticket #{task.ticketNumber}
                                      </span>
                                    )}
                                    
                                    {task.ticketNumber ? `#${task.ticketNumber}: ` : ''}{task.title}
                                  </div>
                                  
                                  {/* Restore assignee, group, and category info */}
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-2">
                                    {task.assigneeId && 
                                      <span>
                                        Assignee: {
                                          technicians.some(t => t.id === task.assigneeId) ? 
                                            technicians.find(t => t.id === task.assigneeId)?.name :
                                            task.assigneeId
                                        }
                                      </span>
                                    }
                                    {task.groupId && 
                                      <span>
                                        Group: {
                                          groups.some(g => g.id === task.groupId) ? 
                                            groups.find(g => g.id === task.groupId)?.name :
                                            task.groupId
                                        }
                                      </span>
                                    }
                                    {task.categoryId && 
                                      <span>
                                        Category: {
                                          categories.some(c => c.id === task.categoryId) ? 
                                            categories.find(c => c.id === task.categoryId)?.value :
                                            task.categoryId
                                        }
                                      </span>
                                    }
                                  </div>
                                </div>
                              ) : null;
                            })}
                          </div>
                        </div>
                      </>
                    )}
                    
                    {/* Task comparison UI */}
                    {group.recommendedAction === 'merge' && group.mergedTask && (
                      <div>
                        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-t-lg p-2">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center space-x-2">
                              <div className="flex items-center bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs font-medium px-3 py-1 rounded-full">
                                <input
                                  type="checkbox"
                                  id={`duplicate-header-${index}`}
                                  checked={selectedDuplicateMerges[index] || false}
                                  onChange={() => toggleDuplicateMergeSelection(index)}
                                  className="h-4 w-4 text-green-600 rounded focus:ring-green-500 border-green-300 mr-2"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <label htmlFor={`duplicate-header-${index}`} className="cursor-pointer">
                                  Merge {group.tasks.length} Tasks
                                </label>
                              </div>
                            </div>
                            <span className="text-xs text-blue-600 dark:text-blue-300 font-medium">
                              {humanizeTaskReferences(group.reason)}
                            </span>
                          </div>
                        </div>
                        <div className="flex border-x border-b border-gray-200 dark:border-gray-700 rounded-b-lg overflow-hidden">
                          {/* Left side: Original tickets */}
                          <div className="w-1/2 border-r border-gray-200 dark:border-gray-700">
                            <div className="bg-gray-50 dark:bg-gray-800 p-2 border-b border-gray-200 dark:border-gray-700">
                              <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                Original Tickets ({group.tasks.length})
                              </div>
                            </div>
                            <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
                              {group.tasks.map((taskId: string, taskIndex: number) => {
                                const task = tasks.find(t => t.id === taskId);
                                return task ? (
                                  <div key={taskId} className="text-sm border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0">
                                    <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                                      {/* Master Task Indicator */}
                                      {taskIndex === 0 && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                          </svg>
                                          Master
                                        </span>
                                      )}
                                      
                                      {/* FreshService Ticket Indicator */}
                                      {task.ticketNumber && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                                          </svg>
                                          Ticket #{task.ticketNumber}
                                        </span>
                                      )}
                                      
                                      {task.ticketNumber ? `#${task.ticketNumber}: ` : ''}{task.title}
                                    </div>
                                    
                                    {/* Restore assignee, group, and category info */}
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-2">
                                      {task.assigneeId && 
                                        <span>
                                          Assignee: {
                                            technicians.some(t => t.id === task.assigneeId) ? 
                                              technicians.find(t => t.id === task.assigneeId)?.name :
                                              task.assigneeId
                                          }
                                        </span>
                                      }
                                      {task.groupId && 
                                        <span>
                                          Group: {
                                            groups.some(g => g.id === task.groupId) ? 
                                              groups.find(g => g.id === task.groupId)?.name :
                                              task.groupId
                                          }
                                        </span>
                                      }
                                      {task.categoryId && 
                                        <span>
                                          Category: {
                                            categories.some(c => c.id === task.categoryId) ? 
                                              categories.find(c => c.id === task.categoryId)?.value :
                                              task.categoryId
                                          }
                                        </span>
                                      }
                                    </div>
                                  </div>
                                ) : null;
                              })}
                            </div>
                          </div>
                          
                          {/* Right side: Merged task */}
                          <div className="w-1/2">
                            <div className="bg-green-50 dark:bg-green-900/20 p-2 border-b border-gray-200 dark:border-gray-700">
                              <div className="text-xs font-medium text-green-700 dark:text-green-300">
                                Merged Result
                              </div>
                            </div>
                            <div className="p-3">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {group.mergedTask.title}
                              </div>
                              <div 
                                className="text-xs mt-2 text-gray-700 dark:text-gray-300"
                                dangerouslySetInnerHTML={{ __html: group.mergedTask.details }}
                              />
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                                {group.mergedTask.assignee && 
                                  <span className="mr-2">
                                    Assignee: {
                                      technicians.some(t => t.id === group.mergedTask.assignee) ? 
                                        technicians.find(t => t.id === group.mergedTask.assignee)?.name :
                                        group.mergedTask.assignee
                                    }
                                  </span>
                                }
                                {group.mergedTask.group && 
                                  <span className="mr-2">
                                    Group: {
                                      groups.some(g => g.id === group.mergedTask.group) ? 
                                        groups.find(g => g.id === group.mergedTask.group)?.name :
                                        group.mergedTask.group
                                    }
                                  </span>
                                }
                                {group.mergedTask.category && 
                                  <span>
                                    Category: {
                                      categories.some(c => c.id === group.mergedTask.category) ? 
                                        categories.find(c => c.id === group.mergedTask.category)?.value :
                                        group.mergedTask.category
                                    }
                                  </span>
                                }
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Similar tasks section */}
          {analysisResults.analysis.similar && analysisResults.analysis.similar.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-md font-medium text-gray-800 dark:text-gray-200 flex items-center">
                <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 mr-2"></span>
                Similar Tasks ({analysisResults.analysis.similar.length})
                {/* AI Recommendation Indicator */}
                <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 py-0.5 px-2 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" className="inline-block h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI: {countMergeEligibleSimilar()} suggested merges
                </span>
              </h4>
              
              {/* Bulk action controls for similar tasks */}
              {countMergeEligibleSimilar() > 3 && (
                <div className="flex justify-end space-x-2 mb-2">
                  <button 
                    onClick={() => selectAllSimilar(true)}
                    className="text-xs bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-800/40 text-blue-700 dark:text-blue-300 px-2 py-1 rounded transition-colors"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => selectAllSimilar(false)}
                    className="text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              )}
              
              <div className="space-y-4">
                {analysisResults.analysis.similar.map((group: any, index: number) => (
                  <div 
                    key={`similar-${index}`} 
                    className={`border rounded-md p-4 ${
                      selectedSimilarMerges[index]
                        ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {/* Keep Separate case - show a simple header */}
                    {group.recommendedAction !== 'merge' && (
                      <>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-2">
                            <div className="pt-0.5">
                              <input
                                type="checkbox"
                                disabled={true}
                                className="h-4 w-4 text-gray-400 rounded focus:ring-gray-500 border-gray-300 cursor-not-allowed"
                              />
                            </div>
                            <div>
                              <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                {group.tasks.length} similar tasks
                              </span>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {humanizeTaskReferences(group.reason)}
                              </p>
                            </div>
                          </div>
                          <div className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                            Keep Separate
                          </div>
                        </div>
                        
                        {/* Task details list */}
                        <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Tasks to keep separate:
                          </div>
                          <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
                            {group.tasks.map((taskId: string, taskIndex: number) => {
                              const task = tasks.find(t => t.id === taskId);
                              return task ? (
                                <div key={taskId} className="text-sm border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0">
                                  <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                                    {/* Master Task Indicator */}
                                    {taskIndex === 0 && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Master
                                      </span>
                                    )}
                                    
                                    {/* FreshService Ticket Indicator */}
                                    {task.ticketNumber && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                                        </svg>
                                        Ticket #{task.ticketNumber}
                                      </span>
                                    )}
                                    
                                    {task.ticketNumber ? `#${task.ticketNumber}: ` : ''}{task.title}
                                  </div>
                                  
                                  {/* Restore assignee, group, and category info */}
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-2">
                                    {task.assigneeId && 
                                      <span>
                                        Assignee: {
                                          technicians.some(t => t.id === task.assigneeId) ? 
                                            technicians.find(t => t.id === task.assigneeId)?.name :
                                            task.assigneeId
                                        }
                                      </span>
                                    }
                                    {task.groupId && 
                                      <span>
                                        Group: {
                                          groups.some(g => g.id === task.groupId) ? 
                                            groups.find(g => g.id === task.groupId)?.name :
                                            task.groupId
                                        }
                                      </span>
                                    }
                                    {task.categoryId && 
                                      <span>
                                        Category: {
                                          categories.some(c => c.id === task.categoryId) ? 
                                            categories.find(c => c.id === task.categoryId)?.value :
                                            task.categoryId
                                        }
                                      </span>
                                    }
                                  </div>
                                </div>
                              ) : null;
                            })}
                          </div>
                        </div>
                      </>
                    )}
                    
                    {/* Task comparison UI */}
                    {group.recommendedAction === 'merge' && group.mergedTask && (
                      <div>
                        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-t-lg p-2">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center space-x-2">
                              <div className="flex items-center bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs font-medium px-3 py-1 rounded-full">
                                <input
                                  type="checkbox"
                                  id={`similar-header-${index}`}
                                  checked={selectedSimilarMerges[index] || false}
                                  onChange={() => toggleSimilarMergeSelection(index)}
                                  className="h-4 w-4 text-green-600 rounded focus:ring-green-500 border-green-300 mr-2"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <label htmlFor={`similar-header-${index}`} className="cursor-pointer">
                                  Merge {group.tasks.length} Tasks
                                </label>
                              </div>
                            </div>
                            <span className="text-xs text-blue-600 dark:text-blue-300 font-medium">
                              {humanizeTaskReferences(group.reason)}
                            </span>
                          </div>
                        </div>
                        <div className="flex border-x border-b border-gray-200 dark:border-gray-700 rounded-b-lg overflow-hidden">
                          {/* Left side: Original tickets */}
                          <div className="w-1/2 border-r border-gray-200 dark:border-gray-700">
                            <div className="bg-gray-50 dark:bg-gray-800 p-2 border-b border-gray-200 dark:border-gray-700">
                              <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                Original Tickets ({group.tasks.length})
                              </div>
                            </div>
                            <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
                              {group.tasks.map((taskId: string, taskIndex: number) => {
                                const task = tasks.find(t => t.id === taskId);
                                return task ? (
                                  <div key={taskId} className="text-sm border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0">
                                    <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                                      {/* Master Task Indicator */}
                                      {taskIndex === 0 && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                          </svg>
                                          Master
                                        </span>
                                      )}
                                      
                                      {/* FreshService Ticket Indicator */}
                                      {task.ticketNumber && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                                          </svg>
                                          Ticket #{task.ticketNumber}
                                        </span>
                                      )}
                                      
                                      {task.ticketNumber ? `#${task.ticketNumber}: ` : ''}{task.title}
                                    </div>
                                    
                                    {/* Restore assignee, group, and category info */}
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-2">
                                      {task.assigneeId && 
                                        <span>
                                          Assignee: {
                                            technicians.some(t => t.id === task.assigneeId) ? 
                                              technicians.find(t => t.id === task.assigneeId)?.name :
                                              task.assigneeId
                                          }
                                        </span>
                                      }
                                      {task.groupId && 
                                        <span>
                                          Group: {
                                            groups.some(g => g.id === task.groupId) ? 
                                              groups.find(g => g.id === task.groupId)?.name :
                                              task.groupId
                                          }
                                        </span>
                                      }
                                      {task.categoryId && 
                                        <span>
                                          Category: {
                                            categories.some(c => c.id === task.categoryId) ? 
                                              categories.find(c => c.id === task.categoryId)?.value :
                                              task.categoryId
                                          }
                                        </span>
                                      }
                                    </div>
                                  </div>
                                ) : null;
                              })}
                            </div>
                          </div>
                          
                          {/* Right side: Merged task */}
                          <div className="w-1/2">
                            <div className="bg-green-50 dark:bg-green-900/20 p-2 border-b border-gray-200 dark:border-gray-700">
                              <div className="text-xs font-medium text-green-700 dark:text-green-300">
                                Merged Result
                              </div>
                            </div>
                            <div className="p-3">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {group.mergedTask.title}
                              </div>
                              <div 
                                className="text-xs mt-2 text-gray-700 dark:text-gray-300"
                                dangerouslySetInnerHTML={{ __html: group.mergedTask.details }}
                              />
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                                {group.mergedTask.assignee && 
                                  <span className="mr-2">
                                    Assignee: {
                                      technicians.some(t => t.id === group.mergedTask.assignee) ? 
                                        technicians.find(t => t.id === group.mergedTask.assignee)?.name :
                                        group.mergedTask.assignee
                                    }
                                  </span>
                                }
                                {group.mergedTask.group && 
                                  <span className="mr-2">
                                    Group: {
                                      groups.some(g => g.id === group.mergedTask.group) ? 
                                        groups.find(g => g.id === group.mergedTask.group)?.name :
                                        group.mergedTask.group
                                    }
                                  </span>
                                }
                                {group.mergedTask.category && 
                                  <span>
                                    Category: {
                                      categories.some(c => c.id === group.mergedTask.category) ? 
                                        categories.find(c => c.id === group.mergedTask.category)?.value :
                                        group.mergedTask.category
                                    }
                                  </span>
                                }
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* No suggestions case */}
          {(!analysisResults.analysis.duplicates || analysisResults.analysis.duplicates.length === 0) && 
           (!analysisResults.analysis.similar || analysisResults.analysis.similar.length === 0) && (
            <div className="text-center py-8">
              <svg className="mx-auto h-12 w-12 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-gray-100">No merge suggestions</h3>
              <p className="mt-1 text-gray-500 dark:text-gray-400">
                No duplicate or similar tasks were found in your selection.
              </p>
              <div className="mt-4">
                <button
                  onClick={cancelAnalysis}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Finish
                </button>
              </div>
            </div>
          )}
          
          {/* Action buttons */}
          <div className="flex justify-between mt-4 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={goBackToProcessing}
              className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Back
            </button>
            
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={cancelAnalysis}
                className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              
              {hasMergeSuggestions() ? (
                <button
                  onClick={applySelectedMerges}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors flex items-center"
                  disabled={isProcessing || selectedMergeCount() === 0}
                >
                  {isProcessing ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Applying...
                    </>
                  ) : (
                    <>
                      Apply {selectedMergeCount()} {selectedMergeCount() === 1 ? 'Merge' : 'Merges'}
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={cancelAnalysis}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Finish
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 