'use client';

import { TechnicianManager } from '@/components/TechnicianManager';
import { TechnicianSync } from '@/components/TechnicianSync';
import { useState, useEffect } from 'react';

export default function TechniciansPage() {
  // State to track when sync is complete to refresh the TechnicianManager
  const [refreshKey, setRefreshKey] = useState(0);
  // State to control the add technician modal
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Handler for when sync is complete
  const handleSyncComplete = () => {
    // Increment the key to force a refresh of the TechnicianManager
    setRefreshKey(prev => prev + 1);
  };
  
  // Handler to open the add technician modal
  const openAddModal = () => {
    setShowAddModal(true);
  };
  
  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Manage Technicians</h1>
        <div className="flex items-center gap-4">
          <button 
            onClick={openAddModal}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-indigo-600 dark:bg-indigo-400 text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 h-10 px-4 py-2 shadow-sm gap-2"
            aria-label="Add a new technician"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Technician
          </button>
          <TechnicianManagerSync onSyncComplete={handleSyncComplete} />
        </div>
      </div>
      
      {/* Render the TechnicianManager component with key for refresh */}
      <div className="flex justify-center">
        {/* Pass openAddModal trigger function and modal state as props */}
        <TechnicianManager 
          key={refreshKey} 
          showAddModal={showAddModal}
          setShowAddModal={setShowAddModal}
        />
      </div>
    </div>
  );
}

// Wrapper component to pass technicians to the TechnicianSync component
function TechnicianManagerSync({ onSyncComplete }: { onSyncComplete: () => void }) {
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Fetch technicians when component mounts
  useEffect(() => {
    const fetchTechnicians = async () => {
      try {
        const response = await fetch('/api/technicians');
        if (response.ok) {
          const data = await response.json();
          setTechnicians(data);
        }
      } catch (error) {
        console.error('Error fetching technicians:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTechnicians();
  }, []);
  
  // Don't render the sync button while loading
  if (loading) return null;
  
  return (
    <TechnicianSync 
      technicians={technicians} 
      onSyncComplete={onSyncComplete} 
    />
  );
} 