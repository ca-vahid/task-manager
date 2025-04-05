'use client';

import { TechnicianManager } from '@/components/TechnicianManager';

export default function TechniciansPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Manage Technicians</h1>
      {/* Render the TechnicianManager component */}
      <div className="flex justify-center">
        <TechnicianManager />
      </div>
    </div>
  );
} 