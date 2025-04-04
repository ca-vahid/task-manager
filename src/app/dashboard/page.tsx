"use client";

import { useEffect, useState } from 'react';
import { Dashboard } from '@/components/Dashboard';
import { Control, Technician } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';

export default function DashboardPage() {
  const [controls, setControls] = useState<Control[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch controls
        const controlsResponse = await fetch('/api/controls');
        if (!controlsResponse.ok) {
          throw new Error(`HTTP error! status: ${controlsResponse.status}`);
        }
        const controlsData = await controlsResponse.json();
        
        // Process the controls data to ensure timestamps are properly formatted
        const processedControls = controlsData.map((control: any) => {
          // Convert estimatedCompletionDate from string to Timestamp if it exists
          if (control.estimatedCompletionDate) {
            try {
              // If it's an ISO string, convert to a Date and then to a Timestamp
              if (typeof control.estimatedCompletionDate === 'string') {
                const date = new Date(control.estimatedCompletionDate);
                if (!isNaN(date.getTime())) {
                  control.estimatedCompletionDate = {
                    seconds: Math.floor(date.getTime() / 1000),
                    nanoseconds: 0,
                    toDate: function() { return new Date(this.seconds * 1000); }
                  };
                }
              }
            } catch (error) {
              console.error("Failed to process timestamp:", error);
            }
          }
          
          // Also convert lastUpdated if it exists
          if (control.lastUpdated) {
            try {
              if (typeof control.lastUpdated === 'string') {
                const date = new Date(control.lastUpdated);
                if (!isNaN(date.getTime())) {
                  control.lastUpdated = {
                    seconds: Math.floor(date.getTime() / 1000),
                    nanoseconds: 0,
                    toDate: function() { return new Date(this.seconds * 1000); }
                  };
                }
              }
            } catch (error) {
              console.error("Failed to process timestamp:", error);
            }
          }
          
          return control;
        });
        
        setControls(processedControls);
        
        // Fetch technicians
        const techniciansResponse = await fetch('/api/technicians');
        if (!techniciansResponse.ok) {
          throw new Error(`HTTP error! status: ${techniciansResponse.status}`);
        }
        const techniciansData = await techniciansResponse.json();
        setTechnicians(techniciansData);
        
      } catch (error: any) {
        console.error("Error fetching data:", error);
        setError(error.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg shadow-md border border-red-200 max-w-md w-full">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Error Loading Dashboard</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Dashboard controls={controls} technicians={technicians} />
    </div>
  );
} 