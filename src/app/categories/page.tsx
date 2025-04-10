'use client';

import { CategoryManager } from '@/components/CategoryManager';

export default function CategoriesPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Categories</h1>
      <div className="flex justify-center">
        <CategoryManager />
      </div>
    </div>
  );
} 