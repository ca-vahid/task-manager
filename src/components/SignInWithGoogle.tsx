"use client";

import { useAuth } from "@/lib/hooks/useAuth";
import Image from "next/image";

export default function SignInWithGoogle() {
  // const { signInWithGoogle } = useAuth(); // Removed: signInWithGoogle is not defined in AuthContext

  return (
    <button
      // onClick={signInWithGoogle} // Removed: signInWithGoogle is not defined in AuthContext
      className="flex items-center justify-center w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-150"
    >
      <Image src="/google-logo.svg" alt="Google logo" width={18} height={18} className="mr-2" />
      Sign in with Google
    </button>
  );
}
