import React, { useState, useEffect } from 'react';
import { Trash2, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

export default function ActiveProjectsList({ activeJobs }) {
  const [expandedProject, setExpandedProject] = useState(null);
  const [recentProjects, setRecentProjects] = useState([]);

  // Fetch and merge recent projects with active jobs
  useEffect(() => {
    const fetchRecentProjects = async () => {
      try {
        const response = await fetch('/api/projects/active');
        if (!response.ok) throw new Error('Failed to fetch recent projects');
        const data = await response.json();
        setRecentProjects(data.projects || []);
      } catch (err) {
        console.error('Error fetching recent projects:', err);
      }
    };

    fetchRecentProjects();
    // Refresh every 5 minutes
    const interval = setInterval(fetchRecentProjects, 300000);
    return () => clearInterval(interval);
  }, []);

  // Handle project deletion
  const handleDelete = async (projectId) => {
    if (!confirm('Are you sure you want to remove this project from the active list?')) {
      return;
    }

    try {
      const response = await fetch(`/api/projects/active/${projectId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete project');
      setRecentProjects(recentProjects.filter(p => p.project_id !== projectId));
    } catch (err) {
      console.error('Error deleting project:', err);
      alert('Failed to delete project');
    }
  };

  // Group jobs by project ID and merge with recent projects
  const projectGroups = Object.values(activeJobs).reduce((acc, job) => {
    const projectId = job.projectId;
    if (!acc[projectId]) {
      acc[projectId] = {
        projectId: job.projectId,
        companyId: job.companyId,
        companyName: job.company,
        companyShortName: job.companyShortName,
        projectName: job.jobName,
        lastActiveAt: job.currentStage.createdAt,
        createdAt: job.currentStage.createdAt,
        stages: [],
        isCurrentlyActive: true
      };
    }
    acc[projectId].stages.push(job.currentStage);
    // Update lastActiveAt if this stage is newer
    const stageDate = new Date(job.currentStage.createdAt);
    if (stageDate > new Date(acc[projectId].lastActiveAt)) {
      acc[projectId].lastActiveAt = job.currentStage.createdAt;
    }
    return acc;
  }, {});

  // Add recent but inactive projects
  recentProjects.forEach(project => {
    const projectId = project.project_id;
    if (!projectGroups[projectId]) {
      projectGroups[projectId] = {
        projectId: project.project_id,
        companyId: project.company_id,
        companyName: project.company_name,
        companyShortName: project.company_short_name,
        projectName: project.project_name,
        lastActiveAt: project.last_active_at,
        createdAt: project.created_at,
        stages: [],
        isCurrentlyActive: false
      };
    }
  });

  // Convert to array and sort by last active date
  const projects = Object.values(projectGroups).sort((a, b) => 
    new Date(b.lastActiveAt) - new Date(a.lastActiveAt)
  );

  if (projects.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <div className="text-gray-500 text-center">
          No active or recent projects found
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="bg-blue-50 p-3 border-b border-blue-200">
        <h2 className="font-semibold text-lg text-blue-800">
          Active Projects ({projects.length})
        </h2>
      </div>

      <div className="divide-y divide-gray-200">
        {projects.map(project => (
          <div key={project.projectId} className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedProject(
                      expandedProject === project.projectId ? null : project.projectId
                    )}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    {expandedProject === project.projectId ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  <span className={`font-medium ${!project.isCurrentlyActive ? 'text-gray-500' : ''}`}>
                    {project.companyName} - {project.projectName}
                  </span>
                  <span className="text-xs text-gray-500">
                    (ID: {project.projectId})
                  </span>
                  {!project.isCurrentlyActive && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Recent
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 ml-6">
                  Last active: {formatDistanceToNow(new Date(project.lastActiveAt))} ago
                </div>
              </div>
              <button
                onClick={() => handleDelete(project.projectId)}
                className="text-gray-400 hover:text-red-600 p-1"
                title="Remove from active projects"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {expandedProject === project.projectId && (
              <div className="mt-2 ml-6 text-sm">
                <div className="grid grid-cols-2 gap-4 mb-2">
                  <div>
                    <div className="text-gray-500">Company ID</div>
                    <div>{project.companyId}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Company Short Name</div>
                    <div>{project.companyShortName || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">First Seen</div>
                    <div>{format(new Date(project.createdAt), 'MMM d, yyyy h:mm a')}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Status</div>
                    <div className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${project.isCurrentlyActive ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                      <span>{project.isCurrentlyActive ? 'Active' : 'Recent'}</span>
                    </div>
                  </div>
                </div>

                {/* Show active stages */}
                {project.stages.length > 0 && (
                  <div className="mt-2 bg-gray-50 rounded p-2">
                    <div className="text-gray-500 mb-1">Current Stages:</div>
                    <div className="space-y-1">
                      {project.stages.map(stage => (
                        <div key={stage.stageId} className="text-sm flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          <span>Stage {stage.stageName}</span>
                          <span className="text-xs text-gray-500">
                            (ID: {stage.stageId})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 