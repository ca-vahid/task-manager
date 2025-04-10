'use client';

import { TechnicianManager } from '@/components/TechnicianManager';
import { TechnicianSync } from '@/components/TechnicianSync';
import { useState, useEffect } from 'react';

export default function TechniciansPage() {
  // State to track when sync is complete to refresh the TechnicianManager
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Handler for when sync is complete
  const handleSyncComplete = () => {
    // Increment the key to force a refresh of the TechnicianManager
    setRefreshKey(prev => prev + 1);
  };
  
  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Manage Technicians</h1>
        <TechnicianManagerSync onSyncComplete={handleSyncComplete} />
      </div>
      
      {/* Render the TechnicianManager component with key for refresh */}
      <div className="flex justify-center">
        <TechnicianManager key={refreshKey} />
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