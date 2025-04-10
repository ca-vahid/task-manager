"use client";

import React, { useState, useEffect } from 'react';
import { Category } from '@/lib/types';

export function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch categories on component mount
  useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/categories');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Categories data:', data);
        setCategories(data.categories || []);
      } catch (err: any) {
        console.error("Failed to fetch categories:", err);
        setError(err.message || "Failed to load categories.");
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm p-6 w-full max-w-lg mx-auto my-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Categories</h3>
      
      {loading && <p className="text-gray-700 dark:text-gray-300">Loading categories...</p>}
      {error && <p className="text-red-500 dark:text-red-400 text-sm mb-4">Error: {error}</p>}

      {/* Categories List */}
      <div className="mt-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          These categories are fetched from Freshservice and are read-only.
        </p>
        
        <ul className="space-y-1 max-h-96 overflow-y-auto">
          {categories.map((category) => (
            <li 
              key={category.id} 
              className="p-2 border border-gray-200 dark:border-gray-700 rounded-md flex justify-between items-center"
            >
              <div>
                <span className="font-medium">{category.value}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                  (ID: {category.displayId})
                </span>
              </div>
            </li>
          ))}
          {categories.length === 0 && !loading && (
            <p className="text-gray-500 dark:text-gray-400 text-sm text-center">No categories found.</p>
          )}
        </ul>
      </div>
    </div>
  );
} 