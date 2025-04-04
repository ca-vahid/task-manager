import { NextResponse } from 'next/server';
import { 
    getDocuments, 
    addDocument 
} from '@/lib/firebase/firebaseUtils'; // Assuming alias @
import { Technician } from '@/lib/types';

const TECHNICIANS_COLLECTION = 'technicians';

// GET /api/technicians - Fetch all technicians
export async function GET() {
  try {
    const technicians = await getDocuments(TECHNICIANS_COLLECTION);
    return NextResponse.json(technicians);
  } catch (error) {
    console.error("Error fetching technicians:", error);
    return NextResponse.json({ message: 'Failed to fetch technicians' }, { status: 500 });
  }
}

// POST /api/technicians - Add a new technician
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ message: 'Invalid technician name provided' }, { status: 400 });
    }

    const newTechnicianData = { name };
    const docRef = await addDocument(TECHNICIANS_COLLECTION, newTechnicianData);
    
    // Return the newly created technician with its ID
    const newTechnician: Omit<Technician, 'id'> = { ...newTechnicianData }; // Constructing without ID initially
    const responseTechnician: Technician = { id: docRef.id, ...newTechnician }; // Adding the ID from docRef

    return NextResponse.json(responseTechnician, { status: 201 });

  } catch (error) {
    console.error("Error adding technician:", error);
    return NextResponse.json({ message: 'Failed to add technician' }, { status: 500 });
  }
} 