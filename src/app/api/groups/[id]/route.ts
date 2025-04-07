import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc, deleteDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';

interface RouteParams {
  params: {
    id: string;
  };
}

// GET /api/groups/[id] - Get a group by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const groupId = params.id;
    
    // Get the group document
    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      return NextResponse.json(
        { error: 'Group not found', message: `No group found with ID: ${groupId}` },
        { status: 404 }
      );
    }
    
    // Return the group data
    return NextResponse.json({
      id: groupId,
      ...groupDoc.data()
    });
  } catch (error) {
    console.error('Error fetching group:', error);
    return NextResponse.json(
      { error: 'Failed to fetch group', message: (error as Error).message },
      { status: 500 }
    );
  }
}

// PUT /api/groups/[id] - Update a group by ID
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const groupId = params.id;
    const body = await request.json();
    
    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'Group name is required' },
        { status: 400 }
      );
    }
    
    // Check if the group exists
    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      return NextResponse.json(
        { error: 'Group not found', message: `No group found with ID: ${groupId}` },
        { status: 404 }
      );
    }
    
    // Update group data
    const updates = {
      name: body.name,
      description: body.description || ''
    };
    
    await updateDoc(groupRef, updates);
    
    // Get the updated document
    const updatedDoc = await getDoc(groupRef);
    
    // Return the updated group
    return NextResponse.json({
      id: groupId,
      ...updatedDoc.data()
    });
  } catch (error) {
    console.error('Error updating group:', error);
    return NextResponse.json(
      { error: 'Failed to update group', message: (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE /api/groups/[id] - Delete a group by ID
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const groupId = params.id;
    
    // Check if the group exists
    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      return NextResponse.json(
        { error: 'Group not found', message: `No group found with ID: ${groupId}` },
        { status: 404 }
      );
    }
    
    // Update all tasks that belong to this group to have null groupId
    const tasksRef = collection(db, 'tasks');
    const q = query(tasksRef, where('groupId', '==', groupId));
    const taskSnapshot = await getDocs(q);
    
    // Batch update tasks to remove the group reference
    const updatePromises = taskSnapshot.docs.map(taskDoc => {
      const taskRef = doc(db, 'tasks', taskDoc.id);
      return updateDoc(taskRef, { groupId: null });
    });
    
    // Wait for all tasks to be updated
    await Promise.all(updatePromises);
    
    // Delete the group
    await deleteDoc(groupRef);
    
    // Return success response
    return NextResponse.json({
      success: true,
      message: `Group ${groupId} deleted successfully`,
      tasksUpdated: taskSnapshot.size
    });
  } catch (error) {
    console.error('Error deleting group:', error);
    return NextResponse.json(
      { error: 'Failed to delete group', message: (error as Error).message },
      { status: 500 }
    );
  }
} 