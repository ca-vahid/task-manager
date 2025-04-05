"use client";

import React, { useState, useEffect } from 'react';
import { Control, Technician } from '@/lib/types';
import { db } from '@/lib/firebase/firebase';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/hooks/useAuth';

interface WidgetConfig {
  id: string;
  type: 'chart' | 'table' | 'kpi';
  chartType?: 'bar' | 'pie' | 'line' | 'area' | 'radialBar';
  title: string;
  dataSource: string;
  width: 'full' | 'half' | 'third';
  filters?: Record<string, any>;
  position: { x: number; y: number };
}

interface DashboardConfig {
  id: string;
  name: string;
  widgets: WidgetConfig[];
  isDefault?: boolean;
}

interface DashboardBuilderProps {
  controls: Control[];
  technicians: Technician[];
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { 
    id: 'status-chart', 
    type: 'chart', 
    chartType: 'pie',
    title: 'Status Distribution', 
    dataSource: 'controls.status', 
    width: 'half',
    position: { x: 0, y: 0 }
  },
  { 
    id: 'company-chart', 
    type: 'chart', 
    chartType: 'radialBar',
    title: 'Company Distribution', 
    dataSource: 'controls.company', 
    width: 'half',
    position: { x: 1, y: 0 }
  },
  { 
    id: 'completion-kpi', 
    type: 'kpi', 
    title: 'Completion Rate', 
    dataSource: 'controls.completionRate', 
    width: 'third',
    position: { x: 0, y: 1 }
  },
  { 
    id: 'total-controls-kpi', 
    type: 'kpi', 
    title: 'Total Controls', 
    dataSource: 'controls.count', 
    width: 'third',
    position: { x: 1, y: 1 }
  },
  { 
    id: 'overdue-kpi', 
    type: 'kpi', 
    title: 'Overdue Controls', 
    dataSource: 'controls.overdue', 
    width: 'third',
    position: { x: 2, y: 1 }
  },
  { 
    id: 'upcoming-deadlines', 
    type: 'table', 
    title: 'Upcoming Deadlines', 
    dataSource: 'controls.upcomingDeadlines', 
    width: 'full',
    position: { x: 0, y: 2 }
  }
];

export function DashboardBuilder({ controls, technicians }: DashboardBuilderProps) {
  const { user } = useAuth();
  const [dashboards, setDashboards] = useState<DashboardConfig[]>([]);
  const [currentDashboard, setCurrentDashboard] = useState<DashboardConfig | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [availableWidgets, setAvailableWidgets] = useState<{id: string, name: string, description: string, type: 'chart' | 'table' | 'kpi'}[]>([
    { id: 'status-chart', name: 'Status Distribution', description: 'Shows distribution of control statuses', type: 'chart' },
    { id: 'company-chart', name: 'Company Distribution', description: 'Shows distribution of controls by company', type: 'chart' },
    { id: 'assignee-chart', name: 'Assignee Workload', description: 'Shows workload by assignee', type: 'chart' },
    { id: 'completion-kpi', name: 'Completion Rate', description: 'Shows overall completion percentage', type: 'kpi' },
    { id: 'total-controls-kpi', name: 'Total Controls', description: 'Shows total number of controls', type: 'kpi' },
    { id: 'overdue-kpi', name: 'Overdue Controls', description: 'Shows number of overdue controls', type: 'kpi' },
    { id: 'upcoming-deadlines', name: 'Upcoming Deadlines', description: 'Shows controls with upcoming deadlines', type: 'table' },
    { id: 'overdue-controls', name: 'Overdue Controls', description: 'Shows overdue controls', type: 'table' },
    { id: 'bgc-controls', name: 'BGC Controls', description: 'Shows controls for BGC company', type: 'table' },
    { id: 'cambio-controls', name: 'Cambio Controls', description: 'Shows controls for Cambio company', type: 'table' },
  ]);

  // Load user dashboards on component mount
  useEffect(() => {
    if (user) {
      loadUserDashboards();
    }
  }, [user]);

  // Load user dashboards from Firestore
  const loadUserDashboards = async () => {
    if (!user) return;
    
    try {
      // First check if user has any dashboards
      const userDashboardsRef = collection(db, 'users', user.uid, 'dashboards');
      const userDashboardsDoc = await getDoc(doc(userDashboardsRef, 'config'));
      
      let loadedDashboards: DashboardConfig[] = [];
      
      if (userDashboardsDoc.exists()) {
        loadedDashboards = userDashboardsDoc.data().dashboards || [];
      } else {
        // Create default dashboard for new users
        const defaultDashboard: DashboardConfig = {
          id: 'default',
          name: 'My Dashboard',
          widgets: DEFAULT_WIDGETS,
          isDefault: true
        };
        
        loadedDashboards = [defaultDashboard];
        await setDoc(doc(userDashboardsRef, 'config'), {
          dashboards: loadedDashboards
        });
      }
      
      setDashboards(loadedDashboards);
      setCurrentDashboard(loadedDashboards.find(d => d.isDefault) || loadedDashboards[0] || null);
    } catch (error) {
      console.error('Error loading dashboards:', error);
    }
  };

  // Save current dashboard configuration
  const saveDashboard = async () => {
    if (!user || !currentDashboard) return;
    
    try {
      const updatedDashboards = dashboards.map(d => 
        d.id === currentDashboard.id ? currentDashboard : d
      );
      
      await setDoc(doc(collection(db, 'users', user.uid, 'dashboards'), 'config'), {
        dashboards: updatedDashboards
      });
      
      setDashboards(updatedDashboards);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving dashboard:', error);
    }
  };

  // Create a new dashboard
  const createDashboard = () => {
    const newDashboard: DashboardConfig = {
      id: `dashboard-${Date.now()}`,
      name: 'New Dashboard',
      widgets: [],
      isDefault: false
    };
    
    setDashboards([...dashboards, newDashboard]);
    setCurrentDashboard(newDashboard);
    setIsEditing(true);
  };

  // Add widget to dashboard
  const addWidget = (widgetType: string) => {
    if (!currentDashboard) return;
    
    const selectedWidget = availableWidgets.find(w => w.id === widgetType);
    if (!selectedWidget) return;
    
    const newWidget: WidgetConfig = {
      id: `${selectedWidget.id}-${Date.now()}`,
      type: selectedWidget.type,
      chartType: selectedWidget.type === 'chart' ? 'bar' : undefined,
      title: selectedWidget.name,
      dataSource: `controls.${selectedWidget.id.split('-')[0]}`,
      width: 'half',
      position: { x: 0, y: currentDashboard.widgets.length > 0 ? Math.max(...currentDashboard.widgets.map(w => w.position.y)) + 1 : 0 }
    };
    
    setCurrentDashboard({
      ...currentDashboard,
      widgets: [...currentDashboard.widgets, newWidget]
    });
  };

  // Remove widget from dashboard
  const removeWidget = (widgetId: string) => {
    if (!currentDashboard) return;
    
    setCurrentDashboard({
      ...currentDashboard,
      widgets: currentDashboard.widgets.filter(w => w.id !== widgetId)
    });
  };

  // Change dashboard
  const changeDashboard = (dashboardId: string) => {
    const selected = dashboards.find(d => d.id === dashboardId);
    if (selected) {
      setCurrentDashboard(selected);
      setIsEditing(false);
    }
  };

  // Set dashboard as default
  const setAsDefault = async (dashboardId: string) => {
    if (!user) return;
    
    const updatedDashboards = dashboards.map(d => ({
      ...d,
      isDefault: d.id === dashboardId
    }));
    
    try {
      await setDoc(doc(collection(db, 'users', user.uid, 'dashboards'), 'config'), {
        dashboards: updatedDashboards
      });
      
      setDashboards(updatedDashboards);
    } catch (error) {
      console.error('Error setting default dashboard:', error);
    }
  };

  // Render widget based on its configuration
  const renderWidget = (widget: WidgetConfig) => {
    // This would render the appropriate widget based on its type and configuration
    // For now, just render a placeholder
    return (
      <div 
        key={widget.id}
        className={`bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow
          ${widget.width === 'full' ? 'col-span-3' : widget.width === 'half' ? 'col-span-3 md:col-span-3 lg:col-span-1' : 'col-span-3 md:col-span-1'}`}
      >
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold text-gray-800">{widget.title}</h3>
          {isEditing && (
            <button 
              onClick={() => removeWidget(widget.id)}
              className="text-red-500 hover:text-red-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
        <div className="h-64 bg-gray-100 rounded flex items-center justify-center">
          <p className="text-gray-500">Widget: {widget.type} - {widget.dataSource}</p>
        </div>
      </div>
    );
  };

  if (!currentDashboard) {
    return <div>Loading dashboards...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-gray-800">
            {isEditing ? 'Edit Dashboard: ' : ''}{currentDashboard.name}
          </h1>
          {currentDashboard.isDefault && (
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
              Default
            </span>
          )}
        </div>
        <div className="flex space-x-2">
          <select 
            className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
            value={currentDashboard.id}
            onChange={(e) => changeDashboard(e.target.value)}
          >
            {dashboards.map(dashboard => (
              <option key={dashboard.id} value={dashboard.id}>
                {dashboard.name} {dashboard.isDefault ? '(Default)' : ''}
              </option>
            ))}
          </select>
          
          {isEditing ? (
            <>
              <button 
                onClick={saveDashboard}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Save
              </button>
              <button 
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Edit
              </button>
              <button 
                onClick={createDashboard}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                New Dashboard
              </button>
              {!currentDashboard.isDefault && (
                <button 
                  onClick={() => setAsDefault(currentDashboard.id)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                >
                  Set as Default
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="bg-gray-100 p-4 rounded-lg mb-4">
          <h2 className="text-lg font-semibold mb-2">Add Widget</h2>
          <div className="flex flex-wrap gap-2">
            {availableWidgets.map(widget => (
              <button
                key={widget.id}
                onClick={() => addWidget(widget.id)}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                title={widget.description}
              >
                {widget.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {currentDashboard.widgets.map(widget => renderWidget(widget))}
      </div>

      {currentDashboard.widgets.length === 0 && (
        <div className="bg-gray-50 p-10 rounded-lg text-center">
          <p className="text-gray-500">No widgets added to this dashboard yet.</p>
          {isEditing && (
            <p className="text-gray-500 mt-2">Use the "Add Widget" section above to add widgets.</p>
          )}
        </div>
      )}
    </div>
  );
} 