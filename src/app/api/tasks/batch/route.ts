import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc, updateDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { BatchOperation } from '@/lib/types';

// POST /api/tasks/batch - Update multiple tasks at once
export async function POST(request: NextRequest) {
  try {
    const body: BatchOperation = await request.json();
    
    // Ensure taskIds and updates are present
    if (!body.taskIds || !body.taskIds.length || !body.updates) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'Task IDs and updates are required' },
        { status: 400 }
      );
    }
    
    const { taskIds, updates } = body;
    
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
    
    // Use a batch to update all tasks
    const batch = writeBatch(db);
    
    // Add each task update to the batch
    for (const taskId of taskIds) {
      const taskRef = doc(db, 'tasks', taskId);
      batch.update(taskRef, updates);
    }
    
    // Commit the batch
    await batch.commit();
    
    // Return success response
    return NextResponse.json({
      success: true,
      message: `${taskIds.length} tasks updated successfully`,
      taskIds,
      updates
    });
  } catch (error) {
    console.error('Error updating tasks in batch:', error);
    return NextResponse.json(
      { error: 'Failed to update tasks', message: (error as Error).message },
      { status: 500 }
    );
  }
} 