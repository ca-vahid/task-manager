import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';

// POST /api/tasks/reorder - Update task order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // The body should be an object with task IDs as keys and order numbers as values
    // Example: { "task1": 0, "task2": 1, "task3": 2 }
    
    if (!body || Object.keys(body).length === 0) {
      return NextResponse.json(
        { error: 'Missing required data', message: 'Order data is required' },
        { status: 400 }
      );
    }
    
    // Use a batch to update all tasks
    const batch = writeBatch(db);
    
    // Add each task update to the batch
    for (const [taskId, order] of Object.entries(body)) {
      const taskRef = doc(db, 'tasks', taskId);
      batch.update(taskRef, { order });
    }
    
    // Commit the batch
    await batch.commit();
    
    // Return success response
    return NextResponse.json({
      success: true,
      message: `${Object.keys(body).length} tasks reordered successfully`
    });
  } catch (error) {
    console.error('Error reordering tasks:', error);
    return NextResponse.json(
      { error: 'Failed to reorder tasks', message: (error as Error).message },
      { status: 500 }
    );
  }
} 