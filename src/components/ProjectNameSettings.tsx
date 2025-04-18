import React, { useState } from 'react';
import { useProjectName } from '@/lib/contexts/ProjectNameContext';

export default function ProjectNameSettings() {
  const { projectName, loading, error, updateProjectName } = useProjectName();
  const [editValue, setEditValue] = useState(projectName || '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  React.useEffect(() => {
    setEditValue(projectName || '');
  }, [projectName]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      await updateProjectName(editValue);
      setSuccess(true);
    } catch {
      // error handled by context
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white dark:bg-gray-800 rounded shadow">
      <h2 className="text-lg font-bold mb-4">Project Name Settings</h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Current Project Name</label>
          <input
            type="text"
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            disabled={loading || saving}
          />
        </div>
        {error && <div className="text-red-500 text-sm">{error}</div>}
        {success && <div className="text-green-600 text-sm">Project name updated!</div>}
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          disabled={loading || saving || !editValue.trim()}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  );
} 