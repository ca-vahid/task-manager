'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  
  // Modal for viewing full task details
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<Task | null>(null);
  
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
  
  // Section visibility
  const [duplicateSectionExpanded, setDuplicateSectionExpanded] = useState(true);
  const [similarSectionExpanded, setSimilarSectionExpanded] = useState(true);
  
  // Create lookup maps for efficient ID translation
  const technicianMap = useMemo(() => {
    const map: Record<string, string> = {};
    technicians.forEach(tech => {
      map[tech.id] = tech.name;
    });
    return map;
  }, [technicians]);
  
  const groupMap = useMemo(() => {
    const map: Record<string, string> = {};
    groups.forEach(group => {
      map[group.id] = group.name;
    });
    return map;
  }, [groups]);
  
  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach(category => {
      map[category.id] = category.value;
    });
    return map;
  }, [categories]);
  
  // Helper function to get name from ID using the lookup maps
  const getNameFromId = (id: string | null, map: Record<string, string>): string => {
    if (!id) return '';
    
    // If it's probably already a name (contains space), return it
    if (id.includes(' ')) {
      return id;
    }
    
    // Look up in map
    if (map[id]) {
      return map[id];
    }
    
    // If it looks like a complex ID (no spaces, longer than 15 chars), truncate for display
    if (id.length > 15 && !id.includes(' ')) {
      return `[Unknown: ${id.substring(0, 6)}...]`;
    }
    
    // Default fallback
    return id;
  };
  
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
          technicians, // Pass the technicians data to the API
          groups,      // Pass the groups data to the API
          categories   // Pass the categories data to the API
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
  
  // Improved helper function to find technician ID by name using much more robust matching
  const findTechnicianIdImproved = (nameOrId: string | null): string | null => {
    if (!nameOrId) return null;
    
    // First check if nameOrId is already a valid ID in our technicians array
    const techById = technicians.find(tech => tech.id === nameOrId);
    if (techById) {
      console.log("Found exact ID match:", techById.name);
      return nameOrId;
    }
    
    // Normalize input for better matching
    const normalizedName = nameOrId.toLowerCase().trim();
    
    // Try exact name match
    const exactNameMatch = technicians.find(
      tech => tech.name.toLowerCase().trim() === normalizedName
    );
    if (exactNameMatch) {
      console.log("Found exact name match:", exactNameMatch.name);
      return exactNameMatch.id;
    }
    
    // Try if any technician name contains the input name
    const containsMatch = technicians.find(
      tech => tech.name.toLowerCase().trim().includes(normalizedName)
    );
    if (containsMatch) {
      console.log("Found contains match:", containsMatch.name);
      return containsMatch.id;
    }
    
    // Try if the input name contains any technician name
    const reverseContainsMatch = technicians.find(
      tech => normalizedName.includes(tech.name.toLowerCase().trim())
    );
    if (reverseContainsMatch) {
      console.log("Found reverse contains match:", reverseContainsMatch.name);
      return reverseContainsMatch.id;
    }
    
    // Try if the input name contains any part (word) of any technician name
    for (const tech of technicians) {
      const techNameParts = tech.name.toLowerCase().trim().split(/\s+/);
      for (const part of techNameParts) {
        if (normalizedName.includes(part) && part.length > 1) {
          console.log("Found part in name match:", tech.name, "part:", part);
          return tech.id;
        }
      }
    }
    
    // Try if any part of the input name matches any part of any technician name
    const nameParts = normalizedName.split(/\s+/);
    for (const part of nameParts) {
      if (part.length < 2) continue; // Skip very short parts
      
      const partMatch = technicians.find(tech => {
        const techParts = tech.name.toLowerCase().trim().split(/\s+/);
        return techParts.some(techPart => techPart.includes(part) || part.includes(techPart));
      });
      
      if (partMatch) {
        console.log("Found name part match:", partMatch.name);
        return partMatch.id;
      }
    }
    
    // If all matching fails, try with initials for multi-part names
    if (nameParts.length > 1) {
      const initials = nameParts.map(part => part[0]).join('').toLowerCase();
      for (const tech of technicians) {
        const techParts = tech.name.toLowerCase().trim().split(/\s+/);
        const techInitials = techParts.map(part => part[0]).join('');
        if (techInitials === initials) {
          console.log("Found initials match:", tech.name);
          return tech.id;
        }
      }
    }
    
    console.log("No match found for:", nameOrId);
    return null;
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
    
    // Create a new object to ensure React detects the state change
    setSelectedDuplicateMerges({
      ...selectedDuplicateMerges,
      ...newSelections
    });
  };
  
  const selectAllSimilar = (select: boolean) => {
    if (!analysisResults?.analysis?.similar) return;
    
    const newSelections: Record<string, boolean> = {};
    analysisResults.analysis.similar.forEach((group: any, index: number) => {
      if (group.recommendedAction === 'merge') {
        newSelections[index] = select;
      }
    });
    
    // Create a new object to ensure React detects the state change
    setSelectedSimilarMerges({
      ...selectedSimilarMerges,
      ...newSelections
    });
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
  
  // Helper to get the details of what will be preserved or combined in a merge
  const getPreservationDetails = (group: any): JSX.Element => {
    // Get all the original tasks
    const originalTasks = group.tasks.map((taskId: string) => tasks.find(t => t.id === taskId)).filter(Boolean);
    if (originalTasks.length < 2) return <></>;
    
    // Create a summary of what's being preserved
    return (
      <div className="bg-gray-50 dark:bg-gray-800/60 mt-3 p-2 rounded-md text-xs text-gray-600 dark:text-gray-400">
        <h5 className="font-medium mb-1 text-gray-700 dark:text-gray-300">Information Preserved:</h5>
        <ul className="space-y-1 pl-1">
          <li className="flex items-start">
            <span className="text-blue-500 dark:text-blue-400 mr-1.5 mt-0.5">•</span>
            <span>
              <strong>Title:</strong> Using &quot;{group.mergedTask.title}&quot; from {
                group.mergedTask.title === originalTasks[0].title 
                  ? "the primary task" 
                  : "combined sources"
              }
            </span>
          </li>
          
          <li className="flex items-start">
            <span className="text-blue-500 dark:text-blue-400 mr-1.5 mt-0.5">•</span>
            <span>
              <strong>Description:</strong> {
                group.mergedTask.details.includes(originalTasks[0].explanation || '')
                  ? "Combined from multiple tasks with primary task details preserved" 
                  : "Enhanced with information from all tasks"
              }
            </span>
          </li>
          
          <li className="flex items-start">
            <span className="text-blue-500 dark:text-blue-400 mr-1.5 mt-0.5">•</span>
            <span>
              <strong>Assignee:</strong> {
                group.mergedTask.assignee 
                  ? `Set to ${getNameFromId(group.mergedTask.assignee, technicianMap)}` 
                  : "Unassigned"
              }
            </span>
          </li>
          
          <li className="flex items-start">
            <span className="text-blue-500 dark:text-blue-400 mr-1.5 mt-0.5">•</span>
            <span>
              <strong>Priority:</strong> Set to {group.mergedTask.priority || "default priority"}
            </span>
          </li>
          
          {group.tasks.length > 2 && (
            <li className="flex items-start">
              <span className="text-blue-500 dark:text-blue-400 mr-1.5 mt-0.5">•</span>
              <span>
                <strong>Linked Tickets:</strong> References to {group.tasks.length} tickets will be preserved in the task history
              </span>
            </li>
          )}
        </ul>
      </div>
    );
  };

  // Show task detail modal when user clicks on a task
  const showTaskDetailModal = (task: Task) => {
    setSelectedTaskForDetail(task);
  };

  // Close task detail modal
  const closeTaskDetailModal = () => {
    setSelectedTaskForDetail(null);
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
            ) : isProcessing ? (
              <svg className="animate-spin h-5 w-5 text-blue-500 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : null}
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              {optimizationComplete ? 'Analysis Complete!' : isProcessing ? 'Analyzing Tasks...' : 'Select Model and Start Analysis'}
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
              className={`font-mono text-sm overflow-auto max-h-[calc(50vh-100px)] p-4 border ${
                useThinkingModel 
                  ? 'border-purple-200 dark:border-purple-800' 
                  : 'border-gray-200 dark:border-gray-800'
              } rounded-lg bg-white dark:bg-gray-900 whitespace-pre-wrap scrollbar`}
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
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Task Merge Suggestions
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Review and select which tasks to merge based on the AI analysis. Select the recommendations you want to apply.
          </p>
          
          {/* Duplicate tasks section */}
          {analysisResults.analysis.duplicates && analysisResults.analysis.duplicates.length > 0 && (
            <div className="space-y-3">
              <h4 
                className="text-md font-medium text-gray-800 dark:text-gray-200 flex items-center cursor-pointer"
                onClick={() => setDuplicateSectionExpanded(!duplicateSectionExpanded)}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-2"></span>
                <span className="flex-1">Duplicate Tasks ({analysisResults.analysis.duplicates.length})</span>
                {/* AI Recommendation Indicator */}
                <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 py-0.5 px-2 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" className="inline-block h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI: {countMergeEligibleDuplicates()} suggested merges
                </span>
                
                {/* Collapse/Expand indicator */}
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className={`h-5 w-5 ml-2 transition-transform ${duplicateSectionExpanded ? 'transform rotate-0' : 'transform rotate-180'}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </h4>
              
              {duplicateSectionExpanded && (
                <>
                  {/* Bulk action controls for duplicates - show whenever there are ANY eligible merges */}
                  {countMergeEligibleDuplicates() > 0 && (
                    <div className="flex items-center justify-between mb-2 bg-gray-50 dark:bg-gray-800 rounded p-2">
                      <div className="text-xs text-gray-600 dark:text-gray-300">
                        <span className="font-medium">{Object.values(selectedDuplicateMerges).filter(Boolean).length}</span> of <span className="font-medium">{countMergeEligibleDuplicates()}</span> duplicate groups selected
                      </div>
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => selectAllDuplicates(true)}
                          className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded transition-colors flex items-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                          </svg>
                          Select All
                        </button>
                        <button 
                          onClick={() => selectAllDuplicates(false)}
                          className="text-xs bg-gray-400 hover:bg-gray-500 text-white px-2 py-1 rounded transition-colors flex items-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Clear All
                        </button>
                      </div>
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
                            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-t-lg p-2">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center space-x-2">
                                  <div className="flex items-center text-gray-700 dark:text-gray-300 text-xs font-medium px-3 py-1 rounded-full">
                                    <div className="h-4 w-4 flex items-center justify-center mr-2 bg-gray-200 dark:bg-gray-700 rounded">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </div>
                                    <span>Keep {group.tasks.length} Tasks Separate</span>
                                  </div>
                                </div>
                                <span className="text-xs text-gray-600 dark:text-gray-400 font-medium px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                                  {humanizeTaskReferences(group.reason)}
                                </span>
                              </div>
                            </div>
                            
                            <div className="border-x border-b border-gray-200 dark:border-gray-700 rounded-b-lg p-3">
                              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
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
                                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" title="Primary Task">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                              <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                                            </svg>
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
                                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-4">
                                        {task.assigneeId && (
                                          <span className="flex items-center">
                                            <span className="font-medium mr-1">Assignee:</span> {getNameFromId(task.assigneeId, technicianMap)}
                                          </span>
                                        )}
                                        {task.groupId && (
                                          <span className="flex items-center">
                                            <span className="font-medium mr-1">Group:</span> {getNameFromId(task.groupId, groupMap)}
                                          </span>
                                        )}
                                        {task.categoryId && (
                                          <span className="flex items-center">
                                            <span className="font-medium mr-1">Category:</span> {getNameFromId(task.categoryId, categoryMap)}
                                          </span>
                                        )}
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
                                      <div 
                                        key={taskId} 
                                        className="text-sm border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 p-2 rounded transition-colors"
                                        onClick={() => showTaskDetailModal(task)}
                                      >
                                        <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                                          {/* Master Task Indicator */}
                                          {taskIndex === 0 && (
                                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" title="Primary Task">
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                                <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                                              </svg>
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
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-4">
                                          {task.assigneeId && (
                                            <span className="flex items-center">
                                              <span className="font-medium mr-1">Assignee:</span> {getNameFromId(task.assigneeId, technicianMap)}
                                            </span>
                                          )}
                                          {task.groupId && (
                                            <span className="flex items-center">
                                              <span className="font-medium mr-1">Group:</span> {getNameFromId(task.groupId, groupMap)}
                                            </span>
                                          )}
                                          {task.categoryId && (
                                            <span className="flex items-center">
                                              <span className="font-medium mr-1">Category:</span> {getNameFromId(task.categoryId, categoryMap)}
                                            </span>
                                          )}
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
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-x-4">
                                    {group.mergedTask.assignee && (
                                      <span className="flex items-center">
                                        <span className="font-medium mr-1">Assignee:</span> {getNameFromId(group.mergedTask.assignee, technicianMap)}
                                      </span>
                                    )}
                                    {group.mergedTask.group && (
                                      <span className="flex items-center">
                                        <span className="font-medium mr-1">Group:</span> {getNameFromId(group.mergedTask.group, groupMap)}
                                      </span>
                                    )}
                                    {group.mergedTask.category && (
                                      <span className="flex items-center">
                                        <span className="font-medium mr-1">Category:</span> {getNameFromId(group.mergedTask.category, categoryMap)}
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Information preservation details */}
                                  {getPreservationDetails(group)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          
          {/* Similar tasks section with similar collapsible functionality */}
          {analysisResults.analysis.similar && analysisResults.analysis.similar.length > 0 && (
            <div className="space-y-3">
              <h4 
                className="text-md font-medium text-gray-800 dark:text-gray-200 flex items-center cursor-pointer"
                onClick={() => setSimilarSectionExpanded(!similarSectionExpanded)}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 mr-2"></span>
                <span className="flex-1">Similar Tasks ({analysisResults.analysis.similar.length})</span>
                {/* AI Recommendation Indicator */}
                <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 py-0.5 px-2 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" className="inline-block h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI: {countMergeEligibleSimilar()} suggested merges
                </span>
                
                {/* Collapse/Expand indicator */}
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className={`h-5 w-5 ml-2 transition-transform ${similarSectionExpanded ? 'transform rotate-0' : 'transform rotate-180'}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </h4>
              
              {similarSectionExpanded && (
                <>
                  {/* Bulk action controls for similar tasks - show whenever there are ANY eligible merges */}
                  {countMergeEligibleSimilar() > 0 && (
                    <div className="flex items-center justify-between mb-2 bg-gray-50 dark:bg-gray-800 rounded p-2">
                      <div className="text-xs text-gray-600 dark:text-gray-300">
                        <span className="font-medium">{Object.values(selectedSimilarMerges).filter(Boolean).length}</span> of <span className="font-medium">{countMergeEligibleSimilar()}</span> similar groups selected
                      </div>
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => selectAllSimilar(true)}
                          className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded transition-colors flex items-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                          </svg>
                          Select All
                        </button>
                        <button 
                          onClick={() => selectAllSimilar(false)}
                          className="text-xs bg-gray-400 hover:bg-gray-500 text-white px-2 py-1 rounded transition-colors flex items-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Clear All
                        </button>
                      </div>
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
                            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-t-lg p-2">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center space-x-2">
                                  <div className="flex items-center text-gray-700 dark:text-gray-300 text-xs font-medium px-3 py-1 rounded-full">
                                    <div className="h-4 w-4 flex items-center justify-center mr-2 bg-gray-200 dark:bg-gray-700 rounded">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </div>
                                    <span>Keep {group.tasks.length} Tasks Separate</span>
                                  </div>
                                </div>
                                <span className="text-xs text-gray-600 dark:text-gray-400 font-medium px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                                  {humanizeTaskReferences(group.reason)}
                                </span>
                              </div>
                            </div>
                            
                            <div className="border-x border-b border-gray-200 dark:border-gray-700 rounded-b-lg p-3">
                              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                                Tasks to keep separate:
                              </div>
                              <div className="space-y-3 max-h-80 overflow-y-auto">
                                {group.tasks.map((taskId: string, taskIndex: number) => {
                                  const task = tasks.find(t => t.id === taskId);
                                  return task ? (
                                    <div key={taskId} className="text-sm border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0">
                                      <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                                        {/* Master Task Indicator */}
                                        {taskIndex === 0 && (
                                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" title="Primary Task">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                              <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                                            </svg>
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
                                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-4">
                                        {task.assigneeId && (
                                          <span className="flex items-center">
                                            <span className="font-medium mr-1">Assignee:</span> {getNameFromId(task.assigneeId, technicianMap)}
                                          </span>
                                        )}
                                        {task.groupId && (
                                          <span className="flex items-center">
                                            <span className="font-medium mr-1">Group:</span> {getNameFromId(task.groupId, groupMap)}
                                          </span>
                                        )}
                                        {task.categoryId && (
                                          <span className="flex items-center">
                                            <span className="font-medium mr-1">Category:</span> {getNameFromId(task.categoryId, categoryMap)}
                                          </span>
                                        )}
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
                                      <div 
                                        key={taskId} 
                                        className="text-sm border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 p-2 rounded transition-colors"
                                        onClick={() => showTaskDetailModal(task)}
                                      >
                                        <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                                          {/* Master Task Indicator */}
                                          {taskIndex === 0 && (
                                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" title="Primary Task">
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                                <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                                              </svg>
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
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-4">
                                          {task.assigneeId && (
                                            <span className="flex items-center">
                                              <span className="font-medium mr-1">Assignee:</span> {getNameFromId(task.assigneeId, technicianMap)}
                                            </span>
                                          )}
                                          {task.groupId && (
                                            <span className="flex items-center">
                                              <span className="font-medium mr-1">Group:</span> {getNameFromId(task.groupId, groupMap)}
                                            </span>
                                          )}
                                          {task.categoryId && (
                                            <span className="flex items-center">
                                              <span className="font-medium mr-1">Category:</span> {getNameFromId(task.categoryId, categoryMap)}
                                            </span>
                                          )}
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
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-x-4">
                                    {group.mergedTask.assignee && (
                                      <span className="flex items-center">
                                        <span className="font-medium mr-1">Assignee:</span> {getNameFromId(group.mergedTask.assignee, technicianMap)}
                                      </span>
                                    )}
                                    {group.mergedTask.group && (
                                      <span className="flex items-center">
                                        <span className="font-medium mr-1">Group:</span> {getNameFromId(group.mergedTask.group, groupMap)}
                                      </span>
                                    )}
                                    {group.mergedTask.category && (
                                      <span className="flex items-center">
                                        <span className="font-medium mr-1">Category:</span> {getNameFromId(group.mergedTask.category, categoryMap)}
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Information preservation details */}
                                  {getPreservationDetails(group)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
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
      
      {/* Task Detail Modal */}
      {selectedTaskForDetail && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={closeTaskDetailModal}
        >
          <div 
            className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="border-b border-gray-200 dark:border-gray-700 py-3 px-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                {selectedTaskForDetail.ticketNumber && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded mr-2 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                    Ticket #{selectedTaskForDetail.ticketNumber}
                  </span>
                )}
                {selectedTaskForDetail.title}
              </h3>
              <button
                onClick={closeTaskDetailModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[calc(100vh-200px)]">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Left column - metadata */}
                <div className="md:col-span-1 space-y-4 border-r border-gray-200 dark:border-gray-700 pr-4">
                  <div>
                    <h4 className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      Status
                    </h4>
                    <div className="flex items-center">
                      <span className={`w-2 h-2 rounded-full mr-2 ${
                        selectedTaskForDetail.status === TaskStatus.Resolved ? 'bg-green-500' : 
                        selectedTaskForDetail.status === TaskStatus.Pending ? 'bg-yellow-500' : 'bg-blue-500'
                      }`}></span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">
                        {selectedTaskForDetail.status}
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      Assignee
                    </h4>
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {selectedTaskForDetail.assigneeId 
                        ? getNameFromId(selectedTaskForDetail.assigneeId, technicianMap)
                        : <span className="text-gray-500 dark:text-gray-400 italic">Unassigned</span>
                      }
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      Group
                    </h4>
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {selectedTaskForDetail.groupId 
                        ? getNameFromId(selectedTaskForDetail.groupId, groupMap)
                        : <span className="text-gray-500 dark:text-gray-400 italic">None</span>
                      }
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      Category
                    </h4>
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {selectedTaskForDetail.categoryId 
                        ? getNameFromId(selectedTaskForDetail.categoryId, categoryMap)
                        : <span className="text-gray-500 dark:text-gray-400 italic">None</span>
                      }
                    </div>
                  </div>
                  
                  {selectedTaskForDetail.estimatedCompletionDate && 
                   typeof selectedTaskForDetail.estimatedCompletionDate.toDate === 'function' && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1">
                        Due Date
                      </h4>
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {selectedTaskForDetail.estimatedCompletionDate.toDate().toLocaleDateString()}
                      </div>
                    </div>
                  )}
                  
                  {selectedTaskForDetail.ticketNumber && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1">
                        Ticket Number
                      </h4>
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {selectedTaskForDetail.ticketNumber}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Right column - task details */}
                <div className="md:col-span-3">
                  <h4 className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
                    Description
                  </h4>
                  <div className="prose prose-sm dark:prose-invert max-w-none mb-4">
                    {selectedTaskForDetail.explanation ? (
                      <div dangerouslySetInnerHTML={{ __html: selectedTaskForDetail.explanation }} />
                    ) : (
                      <p className="text-gray-500 dark:text-gray-400 italic">No description provided</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="border-t border-gray-200 dark:border-gray-700 py-3 px-4 bg-gray-50 dark:bg-gray-800">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={closeTaskDetailModal}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 