"use client";

import React, { useMemo } from 'react';
import { Control, ControlStatus, Technician, PriorityLevel } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { 
  BarChart, Bar, 
  PieChart, Pie, Cell, 
  ResponsiveContainer, 
  CartesianGrid, 
  XAxis, YAxis, 
  Tooltip, 
  Legend,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar
} from 'recharts';

interface DashboardProps {
  controls: Control[];
  technicians: Technician[];
}

// Helper to safely convert timestamp to Date (reuse from TimelineView or define here)
const safeToDate = (timestamp: any): Date | null => {
  try {
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate();
    } else if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp) {
      const { seconds } = timestamp as any;
      if (typeof seconds === 'number' && !isNaN(seconds)) {
        return new Date(seconds * 1000);
      }
    } else if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    console.warn("Could not convert timestamp to Date:", timestamp);
    return null;
  } catch (error) {
    console.error("Error converting timestamp:", error);
    return null;
  }
};

// Updated formatDate to be more robust
const formatDate = (timestamp: Timestamp | null | undefined): string => {
  if (!timestamp) return 'N/A';

  const date = safeToDate(timestamp);

  if (!date) return 'Invalid Date';

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Helper function to get upcoming deadlines (returns controls, not just count)
const getUpcomingDeadlines = (controls: Control[]): Control[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  return controls.filter(control => {
    if (control.status === ControlStatus.Complete) return false;

    const deadlineDate = safeToDate(control.estimatedCompletionDate);
    if (!deadlineDate) return false;

    deadlineDate.setHours(0, 0, 0, 0);
    return deadlineDate >= today && deadlineDate < nextWeek;
  }).sort((a, b) => {
    const dateA = safeToDate(a.estimatedCompletionDate);
    const dateB = safeToDate(b.estimatedCompletionDate);
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.getTime() - dateB.getTime();
  });
};

// Helper function to get overdue controls (returns controls, not just count)
const getOverdueControls = (controls: Control[]): Control[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return controls.filter(control => {
    if (control.status === ControlStatus.Complete) return false;

    const deadlineDate = safeToDate(control.estimatedCompletionDate);
    if (!deadlineDate) return false;

    deadlineDate.setHours(0, 0, 0, 0);
    return deadlineDate < today;
  }).sort((a, b) => {
    const dateA = safeToDate(a.estimatedCompletionDate);
    const dateB = safeToDate(b.estimatedCompletionDate);
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.getTime() - dateB.getTime();
  });
};

export function Dashboard({ controls, technicians }: DashboardProps) {
  // Data for status distribution chart
  const statusData = useMemo(() => {
    const statusCounts: Record<string, number> = {
      [ControlStatus.InProgress]: 0,
      [ControlStatus.InReview]: 0,
      [ControlStatus.Complete]: 0,
      'Not Started': 0
    };
    
    controls.forEach(control => {
      if (control.status === ControlStatus.InProgress) {
        statusCounts[ControlStatus.InProgress]++;
      } else if (control.status === ControlStatus.InReview) {
        statusCounts[ControlStatus.InReview]++;
      } else if (control.status === ControlStatus.Complete) {
        statusCounts[ControlStatus.Complete]++;
      } else {
        statusCounts['Not Started']++;
      }
    });
    
    return Object.entries(statusCounts)
      .filter(([_, count]) => count > 0) // Only include statuses with controls
      .map(([status, count]) => ({
        name: status,
        value: count
      }));
  }, [controls]);
  
  // Data for priority distribution chart
  const priorityData = useMemo(() => {
    const priorityCounts: Record<string, number> = {
      [PriorityLevel.Critical]: 0,
      [PriorityLevel.High]: 0,
      [PriorityLevel.Medium]: 0,
      [PriorityLevel.Low]: 0,
      'None': 0
    };
    
    controls.forEach(control => {
      if (!control.priorityLevel) {
        priorityCounts['None']++;
      } else {
        priorityCounts[control.priorityLevel]++;
      }
    });
    
    return Object.entries(priorityCounts)
      .filter(([_, count]) => count > 0) // Only include priorities with controls
      .map(([priority, count]) => ({
        name: priority,
        value: count
      }));
  }, [controls]);
  
  // Data for assignee workload chart
  const assigneeData = useMemo(() => {
    const assigneeCounts: Record<string, { total: number; completed: number; inProgress: number }> = {};
    
    // Initialize with all technicians
    technicians.forEach(tech => {
      assigneeCounts[tech.id] = { total: 0, completed: 0, inProgress: 0 };
    });
    
    // Add "Unassigned" category
    assigneeCounts['unassigned'] = { total: 0, completed: 0, inProgress: 0 };
    
    // Count controls per assignee
    controls.forEach(control => {
      const assigneeId = control.assigneeId || 'unassigned';
      
      // Initialize if this assignee isn't in our map (shouldn't happen but just in case)
      if (!assigneeCounts[assigneeId]) {
        assigneeCounts[assigneeId] = { total: 0, completed: 0, inProgress: 0 };
      }
      
      assigneeCounts[assigneeId].total++;
      
      if (control.status === ControlStatus.Complete) {
        assigneeCounts[assigneeId].completed++;
      } else if (control.status === ControlStatus.InProgress) {
        assigneeCounts[assigneeId].inProgress++;
      }
    });
    
    // Convert to array for chart
    return Object.entries(assigneeCounts)
      .map(([id, counts]) => ({
        name: id === 'unassigned' ? 'Unassigned' : (
          technicians.find(tech => tech.id === id)?.name || 'Unknown'
        ),
        total: counts.total,
        completed: counts.completed,
        inProgress: counts.inProgress
      }))
      .filter(item => item.total > 0) // Only include assignees with controls
      .sort((a, b) => b.total - a.total); // Sort by total controls
  }, [controls, technicians]);

  // Calculate completion rate
  const completionRate = useMemo(() => {
    if (controls.length === 0) return 0;
    
    const completedCount = controls.filter(
      control => control.status === ControlStatus.Complete
    ).length;
    
    return Math.round((completedCount / controls.length) * 100);
  }, [controls]);
  
  // Get filtered lists of controls
  const upcomingDeadlinesControls = useMemo(() => getUpcomingDeadlines(controls), [controls]);
  const overdueControlsList = useMemo(() => getOverdueControls(controls), [controls]);

  // Calculate counts from the filtered lists
  const upcomingDeadlinesCount = upcomingDeadlinesControls.length;
  const overdueControlsCount = overdueControlsList.length;
  
  // COLORS for charts
  const STATUS_COLORS: Record<string, string> = {
    [ControlStatus.InProgress]: '#6366f1', // indigo-500
    [ControlStatus.InReview]: '#f59e0b', // amber-500
    [ControlStatus.Complete]: '#10b981', // emerald-500
    'Not Started': '#6b7280' // gray-500
  };
  
  const PRIORITY_COLORS: Record<string, string> = {
    [PriorityLevel.Critical]: '#ef4444', // red-500
    [PriorityLevel.High]: '#f97316', // orange-500
    [PriorityLevel.Medium]: '#3b82f6', // blue-500
    [PriorityLevel.Low]: '#10b981', // emerald-500
    'None': '#9ca3af' // gray-400
  };
  
  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-3 shadow-md rounded-md border border-gray-200 dark:border-gray-700">
          <p className="font-medium dark:text-gray-200">{payload[0].name}</p>
          <p className="text-sm dark:text-gray-300">{`Count: ${payload[0].value}`}</p>
          {payload[0].payload && payload[0].payload.percent && (
            <p className="text-sm dark:text-gray-300">{`Percentage: ${(payload[0].payload.percent * 100).toFixed(1)}%`}</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-200">Dashboard</h1>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-dark-card p-4 md:p-6 rounded-xl shadow-sm border border-gray-200 dark:border-dark-border hover:shadow-md transition-shadow">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Controls</h3>
            <span className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </span>
          </div>
          <p className="text-3xl md:text-4xl font-bold text-gray-800 dark:text-gray-200">{controls.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Total managed compliance controls</p>
        </div>
        
        <div className="bg-white dark:bg-dark-card p-4 md:p-6 rounded-xl shadow-sm border border-gray-200 dark:border-dark-border hover:shadow-md transition-shadow">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Completion Rate</h3>
            <span className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </span>
          </div>
          <p className="text-3xl md:text-4xl font-bold text-gray-800 dark:text-gray-200">{completionRate}%</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Overall completion percentage</p>
        </div>
        
        <div className="bg-white dark:bg-dark-card p-4 md:p-6 rounded-xl shadow-sm border border-gray-200 dark:border-dark-border hover:shadow-md transition-shadow">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Upcoming Deadlines</h3>
            <span className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600 dark:text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </span>
          </div>
          <p className="text-3xl md:text-4xl font-bold text-gray-800 dark:text-gray-200">{upcomingDeadlinesCount}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Due in the next 7 days</p>
        </div>
        
        <div className="bg-white dark:bg-dark-card p-4 md:p-6 rounded-xl shadow-sm border border-gray-200 dark:border-dark-border hover:shadow-md transition-shadow">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Overdue Controls</h3>
            <span className="bg-red-100 dark:bg-red-900/30 p-2 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </span>
          </div>
          <p className="text-3xl md:text-4xl font-bold text-red-600 dark:text-red-400">{overdueControlsCount}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Past deadline, requiring attention</p>
        </div>
      </div>
      
      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution Chart */}
        <div className="bg-white dark:bg-dark-card p-4 md:p-6 rounded-xl shadow-sm border border-gray-200 dark:border-dark-border hover:shadow-md transition-shadow">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Control Status Distribution</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {statusData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={STATUS_COLORS[entry.name] || '#9ca3af'} 
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  layout="vertical" 
                  verticalAlign="middle" 
                  align="right"
                  iconType="circle"
                  iconSize={10}
                  formatter={(value, entry, index) => (
                    <span className="text-sm text-gray-700 dark:text-gray-300">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Assignee Workload Chart */}
        <div className="bg-white dark:bg-dark-card p-4 md:p-6 rounded-xl shadow-sm border border-gray-200 dark:border-dark-border hover:shadow-md transition-shadow">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Assignee Workload</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={assigneeData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tickFormatter={(value) => value.toString()} stroke="#9ca3af" />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={100}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Legend 
                  iconType="circle"
                  iconSize={8}
                  formatter={(value, entry, index) => (
                    <span className="text-sm text-gray-700">{value}</span>
                  )}
                />
                <Bar 
                  dataKey="completed" 
                  name="Completed" 
                  stackId="a" 
                  fill="#10b981" 
                  radius={[0, 4, 4, 0]} 
                />
                <Bar 
                  dataKey="inProgress" 
                  name="In Progress" 
                  stackId="a" 
                  fill="#6366f1" 
                  radius={[0, 4, 4, 0]} 
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      {/* Additional Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Priority Distribution Chart */}
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Priority Distribution</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart 
                innerRadius="30%" 
                outerRadius="90%" 
                data={priorityData} 
                startAngle={90} 
                endAngle={-270}
              >
                <RadialBar
                  label={{ fill: '#666', position: 'insideStart' }}
                  background
                  dataKey="value"
                >
                  {priorityData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={PRIORITY_COLORS[entry.name] || '#9ca3af'} 
                    />
                  ))}
                </RadialBar>
                <Legend 
                  iconType="circle" 
                  layout="vertical" 
                  verticalAlign="middle" 
                  align="right" 
                  iconSize={10}
                  formatter={(value, entry, index) => (
                    <span className="text-sm text-gray-700">{value}</span>
                  )}
                />
                <Tooltip content={<CustomTooltip />} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Completion Gauge Chart */}
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Completion Progress</h2>
          <div className="flex h-72 items-center justify-center">
            <div className="relative w-48 h-48">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                {/* Background Circle */}
                <circle
                  className="text-gray-200"
                  strokeWidth="8"
                  stroke="currentColor"
                  fill="transparent"
                  r="40"
                  cx="50"
                  cy="50"
                />
                {/* Progress Circle */}
                <circle
                  className="text-emerald-500"
                  strokeWidth="8"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r="40"
                  cx="50"
                  cy="50"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - completionRate / 100)}`}
                  transform="rotate(-90 50 50)"
                />
                <text
                  x="50"
                  y="50"
                  dy="0.35em"
                  textAnchor="middle"
                  className="font-bold text-gray-800 text-2xl"
                >
                  {completionRate}%
                </text>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="mt-12 text-gray-500 text-sm">
                    {controls.filter(c => c.status === ControlStatus.Complete).length} of {controls.length} controls
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Upcoming Deadlines Section - Use filtered list */}
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Upcoming Deadlines (Next 7 Days)</h2>
        {upcomingDeadlinesCount > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Control</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assignee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {upcomingDeadlinesControls.map(control => (
                  <tr key={control.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="text-xs bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded mr-2 font-mono">DCF-{control.dcfId}</span>
                        <span className="text-sm font-medium text-gray-900">{control.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        control.status === ControlStatus.InProgress 
                          ? 'bg-indigo-100 text-indigo-800' 
                          : control.status === ControlStatus.InReview 
                          ? 'bg-amber-100 text-amber-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {control.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {control.assigneeId 
                        ? (technicians.find(tech => tech.id === control.assigneeId)?.name || 'Unknown')
                        : 'Unassigned'
                      }
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(control.estimatedCompletionDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-gray-50 p-6 rounded-lg text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500 italic">No upcoming deadlines in the next 7 days.</p>
          </div>
        )}
      </div>
      
      {/* Overdue Controls Section - Use filtered list */}
      {overdueControlsCount > 0 && (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border-2 border-red-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-semibold text-red-700">Overdue Controls</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead>
                <tr className="bg-red-50 border-b border-red-100">
                  <th className="px-4 py-3 text-left text-xs font-medium text-red-500 uppercase tracking-wider">Control</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-red-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-red-500 uppercase tracking-wider">Assignee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-red-500 uppercase tracking-wider">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-red-500 uppercase tracking-wider">Days Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {overdueControlsList.map(control => {
                  // Calculate days overdue (ensure date is valid first)
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const dueDate = safeToDate(control.estimatedCompletionDate);
                  let daysOverdue = null;
                  if(dueDate) {
                      dueDate.setHours(0, 0, 0, 0);
                      const diffTime = today.getTime() - dueDate.getTime();
                      // Only calculate if truly overdue (diffTime > 0)
                      if (diffTime > 0) {
                          daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      }
                  }

                  // We already filtered for overdue, so we should have daysOverdue unless date was invalid
                  if (daysOverdue === null && !dueDate) {
                    console.warn(`Control ${control.id} listed as overdue but has invalid date.`);
                    // Optionally skip rendering this row or show 'N/A' for days overdue
                  }

                  return (
                    <tr key={control.id} className="hover:bg-red-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="text-xs bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded mr-2 font-mono">DCF-{control.dcfId}</span>
                          <span className="text-sm font-medium text-gray-900">{control.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          control.status === ControlStatus.InProgress 
                            ? 'bg-indigo-100 text-indigo-800' 
                            : control.status === ControlStatus.InReview 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {control.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {control.assigneeId 
                          ? (technicians.find(tech => tech.id === control.assigneeId)?.name || 'Unknown')
                          : 'Unassigned'
                        }
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(control.estimatedCompletionDate)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-medium text-red-600">{daysOverdue !== null ? `${daysOverdue} days` : 'N/A'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
} 