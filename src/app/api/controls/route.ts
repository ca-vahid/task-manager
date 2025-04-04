import { NextResponse } from 'next/server';
import {
  getDocs, // Use getDocs directly for querying
  addDoc,
  collection, // Import collection
  query, // Import query
  orderBy, // Import orderBy
  QueryDocumentSnapshot, // Import QueryDocumentSnapshot
  DocumentData, // Import DocumentData for typing doc.data()
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase'; // Import db instance
import { Control, ControlStatus } from '@/lib/types';
import { Timestamp } from 'firebase/firestore'; // Import Timestamp

const CONTROLS_COLLECTION = 'controls';

// GET /api/controls - Fetch all controls, ordered by 'order'
export async function GET() {
  try {
    const controlsRef = collection(db, CONTROLS_COLLECTION);
    const q = query(controlsRef, orderBy('order', 'asc')); // Order by the 'order' field
    const querySnapshot = await getDocs(q);
    
    // Add explicit type QueryDocumentSnapshot<DocumentData> for doc
    const controls = querySnapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => {
      const data = doc.data();
      
      // Sanitize the timestamp to prevent invalid timestamp objects
      let sanitizedTimestamp = null;
      if (data.estimatedCompletionDate) {
        try {
          const { seconds, nanoseconds } = data.estimatedCompletionDate;
          
          // Only use timestamp if it has valid seconds and nanoseconds
          if (typeof seconds === 'number' && !isNaN(seconds) && 
              typeof nanoseconds === 'number' && !isNaN(nanoseconds)) {
            // Create a new valid Timestamp
            sanitizedTimestamp = new Timestamp(seconds, nanoseconds);
            
            // Double-check that the date is valid
            const date = sanitizedTimestamp.toDate();
            if (isNaN(date.getTime())) {
              console.warn(`Invalid date from timestamp in document ${doc.id}:`, sanitizedTimestamp);
              sanitizedTimestamp = null;
            }
          } else {
            console.warn(`Invalid timestamp values in document ${doc.id}:`, data.estimatedCompletionDate);
          }
        } catch (error) {
          console.error(`Error processing timestamp in document ${doc.id}:`, error);
        }
      }
      
      // Ensure properties match Control interface, converting if necessary
      return {
        id: doc.id,
        dcfId: data.dcfId as string,
        title: data.title as string,
        explanation: data.explanation as string,
        status: data.status as ControlStatus,
        estimatedCompletionDate: sanitizedTimestamp,
        assigneeId: data.assigneeId as string | null,
        order: data.order as number,
        priorityLevel: data.priorityLevel || null,
        tags: data.tags || [],
        progress: data.progress || 0,
        lastUpdated: data.lastUpdated || null,
        externalUrl: data.externalUrl || null
      } as Control; 
    });

    return NextResponse.json(controls);
  } catch (error) {
    console.error("Error fetching controls:", error);
    return NextResponse.json({ message: 'Failed to fetch controls' }, { status: 500 });
  }
}

// POST /api/controls - Add a new control
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      dcfId,
      title,
      explanation = '', // Default explanation to empty string
      status = ControlStatus.InProgress, // Default status
      estimatedCompletionDate = null,
      assigneeId = null,
      order // Order should be provided, maybe based on current count?
    } = body;

    // Basic Validation
    if (!dcfId || typeof dcfId !== 'string' || 
        !title || typeof title !== 'string' ||
        typeof order !== 'number') {
      return NextResponse.json({ message: 'Invalid control data provided' }, { status: 400 });
    }

    // Validate status enum
    if (!Object.values(ControlStatus).includes(status)) {
       return NextResponse.json({ message: 'Invalid status value' }, { status: 400 });
    }

    let firestoreDate = null;
    if (estimatedCompletionDate) {
        try {
            // Handle different data formats
            if (typeof estimatedCompletionDate === 'string') {
                // If it's a date string (YYYY-MM-DD format from date input)
                if (estimatedCompletionDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    const [year, month, day] = estimatedCompletionDate.split('-').map(num => parseInt(num, 10));
                    
                    // Create a JavaScript Date object at UTC midnight
                    const jsDate = new Date(Date.UTC(year, month - 1, day));
                    
                    // Convert to seconds since epoch (what Firestore uses internally)
                    const seconds = Math.floor(jsDate.getTime() / 1000);
                    
                    // Store these values directly as they're what Firestore uses under the hood
                    firestoreDate = {
                        seconds: seconds,
                        nanoseconds: 0
                    };
                } 
                // If it's an ISO string with a time component
                else if (estimatedCompletionDate.includes('T')) {
                    const jsDate = new Date(estimatedCompletionDate);
                    if (!isNaN(jsDate.getTime())) {
                        const seconds = Math.floor(jsDate.getTime() / 1000);
                        firestoreDate = {
                            seconds: seconds,
                            nanoseconds: 0
                        };
                    }
                }
                // Any other parseable date format
                else {
                    const jsDate = new Date(estimatedCompletionDate);
                    if (!isNaN(jsDate.getTime())) {
                        const seconds = Math.floor(jsDate.getTime() / 1000);
                        firestoreDate = {
                            seconds: seconds,
                            nanoseconds: 0
                        };
                    }
                }
            } 
            // If it's already a timestamp-like object with seconds/nanoseconds
            else if (estimatedCompletionDate.seconds !== undefined && 
                     estimatedCompletionDate.nanoseconds !== undefined) {
                const seconds = parseInt(estimatedCompletionDate.seconds);
                const nanoseconds = parseInt(estimatedCompletionDate.nanoseconds);
                
                if (!isNaN(seconds) && !isNaN(nanoseconds)) {
                    firestoreDate = {
                        seconds: seconds,
                        nanoseconds: nanoseconds
                    };
                }
            }
        } catch (dateError) {
             console.error("Date conversion error:", dateError);
             console.warn("Invalid date format received:", estimatedCompletionDate);
        }
    }

    const newControlData = {
      dcfId,
      title,
      explanation,
      status,
      estimatedCompletionDate: firestoreDate,
      assigneeId,
      order,
      priorityLevel: null,
      tags: [],
      progress: 0,
      lastUpdated: serverTimestamp(),
      externalUrl: body.externalUrl || null
    };

    const docRef = await addDoc(collection(db, CONTROLS_COLLECTION), newControlData);
    
    // When constructing the response, explicitly check that the timestamp is valid,
    // as the client needs to be able to handle the response properly
    const responseControl: Omit<Control, 'estimatedCompletionDate'> & { 
      estimatedCompletionDate: string | null 
    } = {
      id: docRef.id,
      dcfId: newControlData.dcfId,
      title: newControlData.title,
      explanation: newControlData.explanation,
      status: newControlData.status,
      // Don't pass potentially corrupted Timestamp objects to the client
      // Instead, if we have a valid date, convert it to an ISO string
      // The client will handle converting back to a proper Timestamp
      estimatedCompletionDate: newControlData.estimatedCompletionDate 
        ? (() => {
            try {
              // Check if our custom timestamp object has valid seconds
              const { seconds, nanoseconds } = newControlData.estimatedCompletionDate;
              if (typeof seconds === 'number' && !isNaN(seconds)) {
                // Convert seconds to milliseconds for JavaScript Date
                const milliseconds = seconds * 1000;
                const jsDate = new Date(milliseconds);
                
                // Verify date is valid before returning ISO string
                if (!isNaN(jsDate.getTime())) {
                  return jsDate.toISOString();
                }
              }
              console.warn("Invalid timestamp was attempted to be stored, sending null instead");
              return null;
            } catch (error) {
              console.error("Error serializing timestamp for response:", error);
              return null;
            }
          })()
        : null,
      assigneeId: newControlData.assigneeId,
      order: newControlData.order,
      priorityLevel: newControlData.priorityLevel,
      tags: newControlData.tags,
      progress: newControlData.progress,
      lastUpdated: null, // We don't need to send the server timestamp back
      externalUrl: newControlData.externalUrl
    };

    return NextResponse.json(responseControl, { status: 201 });

  } catch (error) {
    console.error("Error adding control:", error);
    // Log the received body for debugging
    try {
      // Need to clone the request to read the body again if needed
      const clonedRequest = request.clone(); 
      const bodyText = await clonedRequest.text(); 
      console.error("Received body:", bodyText);
    } catch (readError) {
       console.error("Could not read request body for logging.");
    }
    return NextResponse.json({ message: 'Failed to add control' }, { status: 500 });
  }
} 