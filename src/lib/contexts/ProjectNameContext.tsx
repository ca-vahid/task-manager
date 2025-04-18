import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getProjectName, setProjectName } from "../firebase/firebaseUtils";

interface ProjectNameContextType {
  projectName: string | null;
  loading: boolean;
  error: string | null;
  refreshProjectName: () => Promise<void>;
  updateProjectName: (name: string) => Promise<void>;
}

const ProjectNameContext = createContext<ProjectNameContextType | undefined>(undefined);

export const useProjectName = () => {
  const context = useContext(ProjectNameContext);
  if (!context) throw new Error("useProjectName must be used within a ProjectNameProvider");
  return context;
};

export const ProjectNameProvider = ({ children }: { children: ReactNode }) => {
  const [projectName, setProjectNameState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProjectName = async () => {
    setLoading(true);
    setError(null);
    try {
      let name = await getProjectName();
      if (!name) {
        name = 'Set your project name';
        await setProjectName(name);
      }
      setProjectNameState(name);
    } catch (err: any) {
      setError(err.message || "Failed to fetch project name");
    } finally {
      setLoading(false);
    }
  };

  const updateProjectName = async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      await setProjectName(name);
      setProjectNameState(name);
    } catch (err: any) {
      setError(err.message || "Failed to update project name");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshProjectName();
  }, []);

  return (
    <ProjectNameContext.Provider value={{ projectName, loading, error, refreshProjectName, updateProjectName }}>
      {children}
    </ProjectNameContext.Provider>
  );
}; 