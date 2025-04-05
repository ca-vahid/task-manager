'use client';

import React, { useMemo, useState } from 'react';
import { Control, Technician, ControlStatus, PriorityLevel, ViewDensity, Company } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import Image from 'next/image';

interface TimelineViewProps {
  controls: Control[];
  technicians: Technician[];
  viewDensity?: ViewDensity;
  onUpdateControl: (id: string, updates: Partial<Omit<Control, 'id'>>) => Promise<void>;
  onDeleteControl: (id: string) => Promise<void>;
}

type TimelineGroup = {
  title: string;
  controls: Control[];
};

export function TimelineView({ 
  controls, 
  technicians, 
  viewDensity = 'medium',
  onUpdateControl, 
  onDeleteControl 
}: TimelineViewProps) {
  
  // State for collapsible groups
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroupCollapse = (title: string) => {
    setCollapsedGroups(prev => ({ ...prev, [title]: !prev[title] }));
  };

  // Group controls by time period
  const timelineGroups = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    const groups: TimelineGroup[] = [
      { title: 'Completed', controls: [] },
      { title: 'Overdue', controls: [] },
      { title: 'Today', controls: [] },
      { title: 'This Week', controls: [] },
      { title: 'This Month', controls: [] },
      { title: 'Future', controls: [] },
      { title: 'No Due Date', controls: [] }
    ];
    
    controls.forEach(control => {
      // Handle obsolete status values from database
      const isValidStatus = Object.values(ControlStatus).includes(control.status as ControlStatus);
      
      // If the control has a valid 'Complete' status, put it in the Completed group
      if (isValidStatus && control.status === ControlStatus.Complete) {
        groups[0].controls.push(control);
        return;
      }
      
      // For non-completed tasks or tasks with obsolete status, organize by date
      if (!control.estimatedCompletionDate) {
        groups[6].controls.push(control);
        return;
      }
      
      // Add safe handling for different timestamp formats
      let dueDate: Date;
      try {
        if (control.estimatedCompletionDate instanceof Timestamp) {
          // It's a proper Firestore Timestamp
          dueDate = control.estimatedCompletionDate.toDate();
        } 
        else if (typeof control.estimatedCompletionDate === 'object' && 
                 control.estimatedCompletionDate !== null &&
                 'seconds' in control.estimatedCompletionDate) {
          // It's an object with seconds/nanoseconds but not a true Timestamp instance
          const { seconds, nanoseconds } = control.estimatedCompletionDate as any;
          if (typeof seconds === 'number' && !isNaN(seconds)) {
            // Create a proper Date object from seconds
            dueDate = new Date(seconds * 1000);
          } else {
            // Invalid seconds value
            groups[6].controls.push(control);
            return;
          }
        } 
        else if (typeof control.estimatedCompletionDate === 'string') {
          // It's a string representation of a date
          dueDate = new Date(control.estimatedCompletionDate);
          if (isNaN(dueDate.getTime())) {
            // Invalid date string
            groups[6].controls.push(control);
            return;
          }
        } 
        else {
          // Unrecognized format
          groups[6].controls.push(control);
          return;
        }
      } catch (error) {
        console.error("Error processing date:", error, control.estimatedCompletionDate);
        groups[6].controls.push(control);
        return;
      }
      
      if (dueDate < today) {
        groups[1].controls.push(control);
      } else if (dueDate < tomorrow) {
        groups[2].controls.push(control);
      } else if (dueDate < nextWeek) {
        groups[3].controls.push(control);
      } else if (dueDate < nextMonth) {
        groups[4].controls.push(control);
      } else {
        groups[5].controls.push(control);
      }
    });
    
    // Sort controls within each group by date (ascending)
    groups.forEach(group => {
      group.controls.sort((a, b) => {
        // Handle null dates
        if (!a.estimatedCompletionDate) return 1;
        if (!b.estimatedCompletionDate) return -1;
        
        // Get Date objects safely from timestamps
        let dateA: Date, dateB: Date;
        
        try {
          // Handle first timestamp
          if (a.estimatedCompletionDate instanceof Timestamp) {
            dateA = a.estimatedCompletionDate.toDate();
          } else if (typeof a.estimatedCompletionDate === 'object' && 
                    a.estimatedCompletionDate !== null &&
                    'seconds' in a.estimatedCompletionDate) {
            const { seconds } = a.estimatedCompletionDate as any;
            dateA = new Date(seconds * 1000);
          } else if (typeof a.estimatedCompletionDate === 'string') {
            dateA = new Date(a.estimatedCompletionDate);
          } else {
            return 1; // Invalid format for A, sort to end
          }
          
          // Handle second timestamp
          if (b.estimatedCompletionDate instanceof Timestamp) {
            dateB = b.estimatedCompletionDate.toDate();
          } else if (typeof b.estimatedCompletionDate === 'object' && 
                    b.estimatedCompletionDate !== null &&
                    'seconds' in b.estimatedCompletionDate) {
            const { seconds } = b.estimatedCompletionDate as any;
            dateB = new Date(seconds * 1000);
          } else if (typeof b.estimatedCompletionDate === 'string') {
            dateB = new Date(b.estimatedCompletionDate);
          } else {
            return -1; // Invalid format for B, sort to beginning
          }
          
          // Sort by time
          return dateA.getTime() - dateB.getTime();
        } catch (error) {
          console.error("Error comparing dates for sorting:", error);
          return 0; // Keep original order on error
        }
      });
    });
    
    // Only return groups with controls
    return groups.filter(group => group.controls.length > 0);
  }, [controls]);
  
  // Get timeline item color based on priority and status
  const getTimelineItemStyle = (control: Control) => {
    // Base style with density adjustments
    let baseStyle = "border-l-4 pl-4 transition-all duration-200 hover:bg-gray-50 relative ";
    
    // Add padding based on density
    if (viewDensity === 'compact') {
      baseStyle += "py-2 ";
    } else if (viewDensity === 'medium') {
      baseStyle += "py-3 ";
    } else {
      baseStyle += "py-4 ";
    }
    
    // Priority-based color
    if (control.priorityLevel === PriorityLevel.Critical) {
      baseStyle += "border-red-500 ";
    } else if (control.priorityLevel === PriorityLevel.High) {
      baseStyle += "border-orange-500 ";
    } else if (control.priorityLevel === PriorityLevel.Medium) {
      baseStyle += "border-blue-500 ";
    } else if (control.priorityLevel === PriorityLevel.Low) {
      baseStyle += "border-green-500 ";
    } else {
      // Default color based on status
      switch (control.status) {
        case ControlStatus.InProgress:
          baseStyle += "border-indigo-400 ";
          break;
        case ControlStatus.InReview:
          baseStyle += "border-amber-400 ";
          break;
        case ControlStatus.Complete:
          baseStyle += "border-emerald-400 ";
          break;
        default:
          // Fallback color for obsolete status values
          baseStyle += "border-gray-300 ";
      }
    }
    
    return baseStyle;
  };
  
  // Helper function to render company indicator
  const renderCompanyIndicator = (company: Company | undefined) => {
    if (!company) return null;
    
    const companyStyles = {
      [Company.BGC]: { img: "/logos/bgc-logo.png", alt: "BGC Logo", size: 16 },
      [Company.Cambio]: { img: "/logos/cambio-logo.png", alt: "Cambio Logo", size: 16 },
      [Company.Both]: {
        bgc: { img: "/logos/bgc-logo.png", alt: "BGC Logo", size: 12 },
        cambio: { img: "/logos/cambio-logo.png", alt: "Cambio Logo", size: 12 },
      }
    };
    
    const styles = companyStyles[company];
    
    return (
      <span className="inline-flex items-center" title={`Company: ${company}`}>
        {company === Company.Both ? (
          <div className="flex items-center space-x-0.5">
            <Image src={styles.bgc.img} alt={styles.bgc.alt} width={styles.bgc.size} height={styles.bgc.size} className="object-contain" />
            <Image src={styles.cambio.img} alt={styles.cambio.alt} width={styles.cambio.size} height={styles.cambio.size} className="object-contain" />
          </div>
        ) : (
          <Image src={styles.img} alt={styles.alt} width={styles.size} height={styles.size} className="object-contain" />
        )}
      </span>
    );
  };
  
  // Format date for display
  const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'No date set';
    
    try {
      let date: Date;
      
      // Handle different timestamp formats
      if (timestamp instanceof Timestamp) {
        date = timestamp.toDate();
      } else if (typeof timestamp === 'object' && 
                timestamp !== null &&
                'seconds' in timestamp) {
        const { seconds } = timestamp as any;
        date = new Date(seconds * 1000);
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else {
        return 'Invalid date format';
      }
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };
  
  // Find technician name
  const getTechnicianName = (techId: string | null): string => {
    if (!techId) return 'Unassigned';
    const tech = technicians.find(t => t.id === techId);
    return tech ? tech.name : 'Unknown';
  };
  
  // Add spacing class based on density
  const getSpacingClass = () => {
    if (viewDensity === 'compact') {
      return 'space-y-4';
    } else if (viewDensity === 'medium') {
      return 'space-y-6';
    } else {
      return 'space-y-8';
    }
  };
  
  return (
    <div className={getSpacingClass()}>
      {timelineGroups.map((group) => {
        const isCollapsed = collapsedGroups[group.title];
        return (
          <div key={group.title} className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow duration-200">
            {/* Sticky Header */}
            <div className={`sticky top-0 z-10 px-4 py-3 flex justify-between items-center cursor-pointer border-b ${
              group.title === 'Completed'
                ? 'bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-800 border-emerald-200'
                : group.title === 'Overdue'
                ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-800 border-red-200'
                : group.title === 'Today'
                ? 'bg-gradient-to-r from-amber-50 to-amber-100 text-amber-800 border-amber-200'
                : group.title === 'This Week'
                ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-800 border-blue-200'
                : group.title === 'This Month'
                ? 'bg-gradient-to-r from-indigo-50 to-indigo-100 text-indigo-800 border-indigo-200'
                : group.title === 'Future'
                ? 'bg-gradient-to-r from-purple-50 to-purple-100 text-purple-800 border-purple-200'
                : 'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-800 border-gray-200'
            }`} onClick={() => toggleGroupCollapse(group.title)}>
              <h3 className="font-semibold flex items-center gap-2">
                {/* Time period icon */}
                {group.title === 'Completed' && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {group.title === 'Overdue' && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
                {group.title === 'Today' && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {group.title === 'This Week' && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
                {group.title === 'This Month' && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                )}
                {group.title === 'Future' && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" />
                  </svg>
                )}
                {group.title === 'No Due Date' && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                )}
                
                {group.title}
                <span className="ml-2 text-xs bg-white bg-opacity-80 rounded-full px-2 py-0.5 shadow-inner">
                  {group.controls.length}
                </span>
              </h3>
              {/* Collapse/Expand Icon */}
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${isCollapsed ? 'rotate-0' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            
            {/* Collapsible Content */}
            {!isCollapsed && (
              <div className="divide-y divide-gray-100">
                {group.controls.map(control => (
                  <div key={control.id} className={getTimelineItemStyle(control)}>
                    {/* Adjust content based on density */}
                    {viewDensity === 'compact' ? (
                      <div className="flex items-center justify-between gap-2 bg-white rounded-md p-1 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center min-w-0 gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                            Object.values(ControlStatus).includes(control.status as ControlStatus) ?
                              (control.status === ControlStatus.Complete ? 'bg-emerald-500' : 
                              control.status === ControlStatus.InProgress ? 'bg-indigo-500' : 
                              control.status === ControlStatus.InReview ? 'bg-amber-500' : 'bg-gray-500')
                            : 'bg-gray-500' // Fallback for obsolete status values
                          }`} title={control.status} />
                          <span className="text-xs font-mono bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded flex-shrink-0">
                            {control.dcfId}
                          </span>
                          <span className="font-medium text-sm truncate">
                            {control.title}
                          </span>
                          {control.company && (
                            <span className="ml-1">
                              {renderCompanyIndicator(control.company)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs flex-shrink-0">
                          {control.priorityLevel && (
                            <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 ${
                              control.priorityLevel === PriorityLevel.Critical ? 'bg-red-100 text-red-700' : 
                              control.priorityLevel === PriorityLevel.High ? 'bg-orange-100 text-orange-700' : 
                              control.priorityLevel === PriorityLevel.Medium ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                            }`}>
                              <span className={`rounded-full h-1.5 w-1.5 flex-shrink-0 ${
                                control.priorityLevel === PriorityLevel.Critical ? 'bg-red-500' : 
                                control.priorityLevel === PriorityLevel.High ? 'bg-orange-500' : 
                                control.priorityLevel === PriorityLevel.Medium ? 'bg-blue-500' : 'bg-green-500'
                              }`} />
                              <span className="text-xs">{control.priorityLevel}</span>
                            </span>
                          )}
                          <span className="text-gray-500 whitespace-nowrap">
                            {formatDate(control.estimatedCompletionDate)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white rounded-md px-2 py-2 mb-1 shadow-sm hover:shadow transition-shadow">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Status badge */}
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              Object.values(ControlStatus).includes(control.status as ControlStatus) ?
                                (control.status === ControlStatus.Complete 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : control.status === ControlStatus.InProgress 
                                  ? 'bg-indigo-100 text-indigo-800' 
                                  : control.status === ControlStatus.InReview
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-100 text-gray-800')
                                : 'bg-gray-100 text-gray-800' // Fallback for obsolete status values
                            }`}>
                              {Object.values(ControlStatus).includes(control.status as ControlStatus) 
                                ? control.status 
                                : 'Unknown Status'}
                            </span>
                            
                            {/* Company badge */}
                            {control.company && renderCompanyIndicator(control.company)}
                            
                            {/* Priority badge */}
                            {control.priorityLevel && (
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                control.priorityLevel === PriorityLevel.Critical 
                                  ? 'bg-red-100 text-red-800' 
                                  : control.priorityLevel === PriorityLevel.High 
                                  ? 'bg-orange-100 text-orange-800' 
                                  : control.priorityLevel === PriorityLevel.Medium 
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {control.priorityLevel}
                              </span>
                            )}
                            
                            {/* DCF ID */}
                            <span className="text-xs font-mono bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                              {control.dcfId}
                            </span>
                          </div>
                          
                          <div className="text-sm text-gray-500 font-medium">
                            {formatDate(control.estimatedCompletionDate)}
                          </div>
                        </div>
                        
                        <h4 className="font-medium text-md text-gray-800">{control.title}</h4>
                        
                        <div className="flex justify-between items-center mt-2">
                          {(viewDensity === 'medium' || viewDensity === 'full') && (
                            <div className="text-sm text-gray-500 flex items-center gap-2">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              {getTechnicianName(control.assigneeId)}
                            </div>
                          )}
                          
                          {viewDensity === 'full' && (
                            <button 
                              onClick={() => {/* Could add functionality to view details */}}
                              className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded border border-indigo-200 hover:bg-indigo-50 transition-colors"
                            >
                              View Details
                            </button>
                          )}
                        </div>
                        
                        {/* Progress bar for controls with progress */}
                        {control.progress !== undefined && control.progress > 0 && (
                          <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                control.progress >= 100 
                                  ? 'bg-emerald-500' 
                                  : control.progress >= 75 
                                  ? 'bg-indigo-500' 
                                  : control.progress >= 50 
                                  ? 'bg-amber-500'
                                  : control.progress >= 25
                                  ? 'bg-orange-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${control.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      
      {timelineGroups.length === 0 && (
        <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500 border border-gray-200">
          No controls found for the timeline view.
        </div>
      )}
    </div>
  );
} 