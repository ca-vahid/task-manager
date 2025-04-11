import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';

// GET /api/tasks/[id] - Get a task by ID
export async function GET(request: NextRequest) {
  try {
    const taskId = request.url.split('/').pop();
    
    if (!taskId) {
      return NextResponse.json(
        { error: 'Missing task ID', message: 'Task ID is required' },
        { status: 400 }
      );
    }
    
    // Get the task document
    const taskRef = doc(db, 'tasks', taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) {
      return NextResponse.json(
        { error: 'Task not found', message: `No task found with ID: ${taskId}` },
        { status: 404 }
      );
    }
    
    // Return the task data
    return NextResponse.json({
      id: taskId,
      ...taskDoc.data()
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task', message: (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/[id] - Delete a task by ID
export async function DELETE(request: NextRequest) {
  try {
    const taskId = request.url.split('/').pop();
    
    if (!taskId) {
      return NextResponse.json(
        { error: 'Missing task ID', message: 'Task ID is required' },
        { status: 400 }
      );
    }
    
    // Check if the task exists
    const taskRef = doc(db, 'tasks', taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) {
      return NextResponse.json(
        { error: 'Task not found', message: `No task found with ID: ${taskId}` },
        { status: 404 }
      );
    }
    
    // Delete the task
    await deleteDoc(taskRef);
    
    // Return success response
    return NextResponse.json({
      success: true,
      message: `Task ${taskId} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { error: 'Failed to delete task', message: (error as Error).message },
      { status: 500 }
    );
  }
} 