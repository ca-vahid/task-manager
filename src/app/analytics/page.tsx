"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Control, Technician } from '@/lib/types';
import { DashboardBuilder } from '@/components/analytics/DashboardBuilder';
import { ReportGenerator } from '@/components/analytics/ReportGenerator';
import { AuditTrail } from '@/components/analytics/AuditTrail';

enum AnalyticsTab {
  Dashboards = 'dashboards',
  Reports = 'reports',
  AuditTrail = 'audit'
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [controls, setControls] = useState<Control[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(AnalyticsTab.Dashboards);

  // Load necessary data on component mount
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  // Load controls and technicians from Firestore
  const loadData = async () => {
    setLoading(true);
    
    try {
      // Load controls
      const controlsSnapshot = await getDocs(collection(db, 'controls'));
      const loadedControls: Control[] = [];
      
      controlsSnapshot.forEach(doc => {
        loadedControls.push({ id: doc.id, ...doc.data() } as Control);
      });
      
      setControls(loadedControls);
      
      // Load technicians
      const techniciansSnapshot = await getDocs(collection(db, 'technicians'));
      const loadedTechnicians: Technician[] = [];
      
      techniciansSnapshot.forEach(doc => {
        loadedTechnicians.push({ id: doc.id, ...doc.data() } as Technician);
      });
      
      setTechnicians(loadedTechnicians);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle tab change
  const handleTabChange = (tab: AnalyticsTab) => {
    setActiveTab(tab);
  };

  // If not logged in, show login message
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Please login to access analytics</h1>
          <p className="text-gray-600">You must be logged in to view this page.</p>
        </div>
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-blue-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <h1 className="text-xl font-semibold text-gray-800">Loading analytics data...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Analytics & Reporting</h1>
      
      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => handleTabChange(AnalyticsTab.Dashboards)}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === AnalyticsTab.Dashboards
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Dashboards
          </button>
          <button
            onClick={() => handleTabChange(AnalyticsTab.Reports)}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === AnalyticsTab.Reports
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Report Generator
          </button>
          <button
            onClick={() => handleTabChange(AnalyticsTab.AuditTrail)}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === AnalyticsTab.AuditTrail
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Audit Trail
          </button>
        </nav>
      </div>
      
      {/* Tab Content */}
      <div className="pb-16">
        {activeTab === AnalyticsTab.Dashboards && (
          <DashboardBuilder controls={controls} technicians={technicians} />
        )}
        
        {activeTab === AnalyticsTab.Reports && (
          <ReportGenerator controls={controls} technicians={technicians} />
        )}
        
        {activeTab === AnalyticsTab.AuditTrail && (
          <AuditTrail initialLimit={50} />
        )}
      </div>
    </div>
  );
} 