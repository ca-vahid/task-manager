"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth'; // Assuming alias
import { ControlList } from '@/components/ControlList'; // Import ControlList

export default function Home() {
  const { user, loading } = useAuth(); // Only need user and loading for redirect
  const router = useRouter();

  useEffect(() => {
    // If not loading and no user exists, redirect to login
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Loading state handled within Layout/AuthProvider potentially, or show minimal here
  if (loading || !user) {
    return (
      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center">
        <p>Loading...</p> {/* Centered loading */} 
      </div>
    );
  }

  // Render the ControlList for the main page
  return (
    <div className="container mx-auto px-4 max-w-7xl">
      <div className="py-6">
        <ControlList />
      </div>
    </div>
  );
}
