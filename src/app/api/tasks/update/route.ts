import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';

// POST /api/tasks/update - Update a task
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Ensure ID is present
    if (!body.id) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'Task ID is required' },
        { status: 400 }
      );
    }
    
    const taskId = body.id;
    const { id, ...updates } = body; // Remove ID from updates
    
    // Handle any date/timestamp conversions if needed
    if (updates.estimatedCompletionDate) {
      // If it's a string or ISO date, convert it to a Timestamp
      if (typeof updates.estimatedCompletionDate === 'string') {
        const date = new Date(updates.estimatedCompletionDate);
        if (isNaN(date.getTime())) {
          return NextResponse.json(
            { error: 'Invalid date', message: 'The provided date is invalid' },
            { status: 400 }
          );
        }
        updates.estimatedCompletionDate = Timestamp.fromDate(date);
      }
    }
    
    // Add lastUpdated timestamp
    updates.lastUpdated = Timestamp.now();
    
    // Update the document in Firestore
    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, updates);
    
    // Get the updated document
    const updatedDoc = await getDoc(taskRef);
    const data = updatedDoc.data();
    
    // Return the updated task
    return NextResponse.json({
      id: taskId,
      ...data
    });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Failed to update task', message: (error as Error).message },
      { status: 500 }
    );
  }
} 