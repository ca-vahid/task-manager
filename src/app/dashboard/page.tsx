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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-red-100 max-w-md w-full">
          <div className="text-center mb-4">
            <div className="bg-red-100 text-red-600 rounded-full p-3 inline-block">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2 text-center">Error Loading Dashboard</h2>
          <p className="text-gray-600 mb-6 text-center">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pt-6 pb-12 px-4 md:px-6">
      <Dashboard controls={controls} technicians={technicians} />
    </div>
  );
} 