import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, doc, getDoc, addDoc } from 'firebase/firestore';
import { Group } from '@/lib/types';

// GET /api/groups - Get all groups
export async function GET(request: NextRequest) {
  try {
    const groupsRef = collection(db, 'groups');
    const snapshot = await getDocs(groupsRef);
    
    const groups = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return NextResponse.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch groups', message: (error as Error).message },
      { status: 500 }
    );
  }
}

// POST /api/groups - Create a new group
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const groupsRef = collection(db, 'groups');
    
    // Ensure required fields are present
    if (!body.name) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'Group name is required' },
        { status: 400 }
      );
    }
    
    // Create a new group object
    const newGroup: Omit<Group, 'id'> = {
      name: body.name,
      description: body.description || ''
    };
    
    // Add the document to Firestore
    const docRef = await addDoc(groupsRef, newGroup);
    
    // Get the newly created document
    const docSnapshot = await getDoc(doc(db, 'groups', docRef.id));
    const data = docSnapshot.data();
    
    // Return the created group with its ID
    return NextResponse.json({
      id: docRef.id,
      ...data
    });
  } catch (error) {
    console.error('Error creating group:', error);
    return NextResponse.json(
      { error: 'Failed to create group', message: (error as Error).message },
      { status: 500 }
    );
  }
} 