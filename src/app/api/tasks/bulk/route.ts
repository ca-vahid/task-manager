import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { Task } from '@/lib/types';

// POST /api/tasks/bulk - Create multiple tasks at once
export async function POST(request: NextRequest) {
  try {
    const tasks: Omit<Task, 'id'>[] = await request.json();
    
    // Ensure tasks array is present and not empty
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'Tasks array is required' },
        { status: 400 }
      );
    }
    
    // Validate tasks
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      // Ensure each task has a title
      if (!task.title) {
        return NextResponse.json(
          { error: 'Invalid task data', message: `Task at index ${i} is missing a title` },
          { status: 400 }
        );
      }
      
      // Handle estimatedCompletionDate if it's a string
      if (task.estimatedCompletionDate && typeof task.estimatedCompletionDate === 'string') {
        try {
          const date = new Date(task.estimatedCompletionDate);
          if (isNaN(date.getTime())) {
            throw new Error('Invalid date');
          }
          tasks[i].estimatedCompletionDate = Timestamp.fromDate(date);
        } catch (error) {
          return NextResponse.json(
            { error: 'Invalid date', message: `Invalid date format in task at index ${i}` },
            { status: 400 }
          );
        }
      }
      
      // Set lastUpdated if not provided
      if (!task.lastUpdated) {
        tasks[i].lastUpdated = Timestamp.now();
      }
    }
    
    // Use a batch to add all tasks
    const batch = writeBatch(db);
    const tasksRef = collection(db, 'tasks');
    
    // We need to keep track of the IDs for the response
    const taskIdsForResponse: string[] = [];
    const tasksForResponse: any[] = [];
    
    // Since Firestore batch API doesn't return document IDs, we need to create them first
    for (const task of tasks) {
      const docRef = doc(tasksRef);
      batch.set(docRef, task);
      taskIdsForResponse.push(docRef.id);
      tasksForResponse.push({ id: docRef.id, ...task });
    }
    
    // Commit the batch
    await batch.commit();
    
    // Return success response with the created tasks
    return NextResponse.json(tasksForResponse);
  } catch (error) {
    console.error('Error creating tasks in bulk:', error);
    return NextResponse.json(
      { error: 'Failed to create tasks', message: (error as Error).message },
      { status: 500 }
    );
  }
} 