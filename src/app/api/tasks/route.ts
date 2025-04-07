import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, doc, getDoc, addDoc, Timestamp } from 'firebase/firestore';
import { Task } from '@/lib/types';

// GET /api/tasks - Get all tasks
export async function GET(request: NextRequest) {
  try {
    const tasksRef = collection(db, 'tasks');
    const snapshot = await getDocs(tasksRef);
    
    const tasks = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Convert Firestore timestamps to Timestamp objects
      const estimatedCompletionDate = data.estimatedCompletionDate 
        ? new Timestamp(
            data.estimatedCompletionDate.seconds, 
            data.estimatedCompletionDate.nanoseconds
          ) 
        : null;
        
      const lastUpdated = data.lastUpdated 
        ? new Timestamp(
            data.lastUpdated.seconds, 
            data.lastUpdated.nanoseconds
          ) 
        : null;
      
      return {
        id: doc.id,
        ...data,
        estimatedCompletionDate,
        lastUpdated
      };
    });
    
    return NextResponse.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks', message: (error as Error).message },
      { status: 500 }
    );
  }
}

// POST /api/tasks - Create a new task
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tasksRef = collection(db, 'tasks');
    
    // Ensure required fields are present
    if (!body.title) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'Title is required' },
        { status: 400 }
      );
    }
    
    // Add lastUpdated if not provided
    if (!body.lastUpdated) {
      body.lastUpdated = Timestamp.now();
    }
    
    // Add the document to Firestore
    const docRef = await addDoc(tasksRef, body);
    
    // Get the newly created document
    const docSnapshot = await getDoc(doc(db, 'tasks', docRef.id));
    const data = docSnapshot.data();
    
    // Return the created task with its ID
    return NextResponse.json({
      id: docRef.id,
      ...data
    });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Failed to create task', message: (error as Error).message },
      { status: 500 }
    );
  }
} 