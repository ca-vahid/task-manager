import { auth, db, storage } from "./firebase";
import {
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// Auth functions
export const logoutUser = () => signOut(auth);

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

// Firestore functions
export const addDocument = (collectionName: string, data: any) =>
  addDoc(collection(db, collectionName), data);

export const getDocuments = async (collectionName: string) => {
  const querySnapshot = await getDocs(collection(db, collectionName));
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

export const updateDocument = (collectionName: string, id: string, data: any) =>
  updateDoc(doc(db, collectionName, id), data);

export const deleteDocument = (collectionName: string, id: string) =>
  deleteDoc(doc(db, collectionName, id));

// Get the project name from Firestore (/settings/projectName)
export const getProjectName = async (): Promise<string | null> => {
  const docRef = doc(db, "settings", "projectName");
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data().value || null;
  }
  return null;
};

// Set the project name in Firestore (/settings/projectName)
export const setProjectName = async (name: string): Promise<void> => {
  const docRef = doc(db, "settings", "projectName");
  await setDoc(docRef, { value: name });
};

// Get the main page title from Firestore (/settings/mainPageTitle)
export const getMainPageTitle = async (): Promise<string | null> => {
  const docRef = doc(db, "settings", "mainPageTitle");
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data().value || null;
  }
  return null;
};

// Set the main page title in Firestore (/settings/mainPageTitle)
export const setMainPageTitle = async (title: string): Promise<void> => {
  const docRef = doc(db, "settings", "mainPageTitle");
  await setDoc(docRef, { value: title });
};

// Storage functions
export const uploadFile = async (file: File, path: string) => {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
};
