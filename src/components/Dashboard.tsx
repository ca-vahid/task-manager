"use client";

import React, { useMemo } from 'react';
import { Control, ControlStatus, Technician } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { 
  BarChart, Bar, 
  PieChart, Pie, Cell, 
  ResponsiveContainer, 
  LineChart, Line, 
  CartesianGrid, 
  XAxis, YAxis, 
  Tooltip, 
  Legend,
  AreaChart,
  Area
} from 'recharts';

interface DashboardProps {
  controls: Control[];
  technicians: Technician[];
}

// Helper function to get upcoming deadlines
const getUpcomingDeadlines = (controls: Control[], days: number = 7) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return controls
    .filter(control => {
      // Skip completed controls
      if (control.status === ControlStatus.Complete) return false;
      
      // Skip controls without a deadline
      if (!control.estimatedCompletionDate) return false;
      
      try {
        const deadlineDate = control.estimatedCompletionDate.toDate();
        const diffTime = deadlineDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Return true if the deadline is within the specified number of days
        return diffDays >= 0 && diffDays <= days;
      } catch (error) {
        console.error("Error calculating deadline:", error);
        return false;
      }
    })
    .sort((a, b) => {
      if (!a.estimatedCompletionDate || !b.estimatedCompletionDate) return 0;
      return a.estimatedCompletionDate.toDate().getTime() - b.estimatedCompletionDate.toDate().getTime();
    });
};

export function Dashboard({ controls, technicians }: DashboardProps) {
  // Data for status distribution chart
  const statusData = useMemo(() => {
    const statusCounts = {
      [ControlStatus.InProgress]: 0,
      [ControlStatus.InReview]: 0,
      [ControlStatus.Complete]: 0,
      'Not Started': 0
    };
    
    controls.forEach(control => {
      if (control.status in statusCounts) {
        statusCounts[control.status]++;
      } else {
        statusCounts['Not Started']++;
      }
    });
    
    return Object.entries(statusCounts).map(([status, count]) => ({
      name: status,
      value: count
    }));
  }, [controls]);
  
  // Data for assignee workload chart
  const assigneeData = useMemo(() => {
    const assigneeCounts: Record<string, { total: number, completed: number, inProgress: number }> = {};
    
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
  
  // Get upcoming deadlines
  const upcomingDeadlines = useMemo(() => getUpcomingDeadlines(controls), [controls]);
  
  // Get overdue controls
  const overdueControls = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return controls
      .filter(control => {
        // Skip completed controls
        if (control.status === ControlStatus.Complete) return false;
        
        // Skip controls without a deadline
        if (!control.estimatedCompletionDate) return false;
        
        try {
          const deadlineDate = control.estimatedCompletionDate.toDate();
          return deadlineDate < today;
        } catch (error) {
          console.error("Error calculating overdue:", error);
          return false;
        }
      })
      .sort((a, b) => {
        if (!a.estimatedCompletionDate || !b.estimatedCompletionDate) return 0;
        // Sort oldest first
        return a.estimatedCompletionDate.toDate().getTime() - b.estimatedCompletionDate.toDate().getTime();
      });
  }, [controls]);
  
  // COLORS for charts
  const STATUS_COLORS = {
    [ControlStatus.InProgress]: '#6366f1', // indigo-500
    [ControlStatus.InReview]: '#f59e0b', // amber-500
    [ControlStatus.Complete]: '#10b981', // emerald-500
    'Not Started': '#6b7280' // gray-500
  };
  
  const CHART_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  
  // Format date for display
  const formatDate = (timestamp: Timestamp) => {
    try {
      const date = timestamp.toDate();
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (error) {
      return 'Invalid date';
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-gray-500 text-sm font-medium">Total Controls</h3>
          <p className="text-3xl font-bold text-gray-800">{controls.length}</p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-gray-500 text-sm font-medium">Completion Rate</h3>
          <p className="text-3xl font-bold text-gray-800">{completionRate}%</p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-gray-500 text-sm font-medium">Upcoming Deadlines</h3>
          <p className="text-3xl font-bold text-gray-800">{upcomingDeadlines.length}</p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-gray-500 text-sm font-medium">Overdue Controls</h3>
          <p className="text-3xl font-bold text-red-600">{overdueControls.length}</p>
        </div>
      </div>
      
      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Status Distribution Chart */}
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Control Status Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Assignee Workload Chart */}
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Assignee Workload</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={assigneeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" name="Completed" stackId="a" fill="#10b981" />
                <Bar dataKey="inProgress" name="In Progress" stackId="a" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      {/* Upcoming Deadlines Section */}
      <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Upcoming Deadlines (Next 7 Days)</h2>
        {upcomingDeadlines.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Control</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assignee</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {upcomingDeadlines.map(control => (
                  <tr key={control.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="text-xs bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded mr-2 font-mono">DCF-{control.dcfId}</span>
                        <span className="text-sm font-medium text-gray-900">{control.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
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
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                      {control.assigneeId 
                        ? (technicians.find(tech => tech.id === control.assigneeId)?.name || 'Unknown')
                        : 'Unassigned'
                      }
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                      {control.estimatedCompletionDate && formatDate(control.estimatedCompletionDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 italic">No upcoming deadlines in the next 7 days.</p>
        )}
      </div>
      
      {/* Overdue Controls Section */}
      {overdueControls.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow-md border border-red-100">
          <h2 className="text-lg font-semibold text-red-700 mb-4">Overdue Controls</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead>
                <tr className="bg-red-50 border-b">
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-500 uppercase tracking-wider">Control</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-500 uppercase tracking-wider">Assignee</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-500 uppercase tracking-wider">Due Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-500 uppercase tracking-wider">Days Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {overdueControls.map(control => {
                  // Calculate days overdue
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const dueDate = control.estimatedCompletionDate?.toDate() || today;
                  const diffTime = today.getTime() - dueDate.getTime();
                  const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  
                  return (
                    <tr key={control.id} className="hover:bg-red-50">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="text-xs bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded mr-2 font-mono">DCF-{control.dcfId}</span>
                          <span className="text-sm font-medium text-gray-900">{control.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
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
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                        {control.assigneeId 
                          ? (technicians.find(tech => tech.id === control.assigneeId)?.name || 'Unknown')
                          : 'Unassigned'
                        }
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                        {control.estimatedCompletionDate && formatDate(control.estimatedCompletionDate)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="text-sm font-medium text-red-600">{daysOverdue} days</span>
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