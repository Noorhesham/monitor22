import React, { memo, useState, useEffect } from 'react';
import { Check, X, Settings, Grid, List, Eye, Save } from 'lucide-react';
import { API_CONFIG } from '@config';

const JobMonitoringPanel = memo(({
  job,
  headers, // Should be headers for the current stage only
  onThresholdChange,
  headerSettings, // Pass the full headerSettings object from context
  headerValues,
  alerts
}) => {
  const currentStage = job.currentStage;
  const projectId = job.projectId;
  
  // State for selected headers and view mode
  const [selectedHeaders, setSelectedHeaders] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
  const [editingThresholds, setEditingThresholds] = useState({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [monitoredHeaders, setMonitoredHeaders] = useState({});

  // Find alerts specific to the headers of this job's current stage
  const stageHeaderIds = new Set(headers.map(h => h.id));
  const stageAlerts = alerts.filter(alert => stageHeaderIds.has(alert.headerId));

  // Debug headerValues
  useEffect(() => {
    console.log(`JobMonitoringPanel for job ${job.jobId} - ${job.jobName}`);
    console.log(`Current headers: ${headers.length} items`);
    console.log(`Headers with values: ${headerValues ? Object.keys(headerValues).length : 0} items`);
    
    // Check if any of our headers have values
    const headerValueCount = headers.reduce((count, header) => {
      return headerValues && headerValues[header.id] ? count + 1 : count;
    }, 0);
    console.log(`Headers in this panel with values: ${headerValueCount}/${headers.length}`);
    
    if (headerValueCount === 0 && headers.length > 0 && headerValues && Object.keys(headerValues).length > 0) {
      console.warn("No matching header IDs found - potential ID mismatch");
      console.log("First few local header IDs:", headers.slice(0, 3).map(h => h.id));
      console.log("First few headerValues keys:", Object.keys(headerValues).slice(0, 3));
    }
  }, [headers, headerValues, job.jobId, job.jobName]);

  // Load monitored headers
  const loadMonitoredHeaders = async () => {
    try {
      setIsLoading(true);
      
      // Try to load saved settings from backend
      try {
        console.log(`Fetching header settings for project ${projectId}`);
        const response = await fetch(`${API_CONFIG.baseUrl}/api/settings/project/${projectId}/headers`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`Loaded ${data.headerSettings?.length || 0} header settings from backend`);
          
          // Initialize selected headers from response
          if (data.headerSettings && Array.isArray(data.headerSettings)) {
            const selectedIds = new Set(
              data.headerSettings
                .filter(h => h.is_monitored)
                .map(h => h.header_id)
            );
            setSelectedHeaders(selectedIds);
            
            // Initialize thresholds
            const thresholds = {};
            data.headerSettings.forEach(h => {
              if (h.threshold !== undefined && h.threshold !== null) {
                thresholds[h.header_id] = h.threshold;
              }
            });
            setEditingThresholds(thresholds);
          }
        } else {
          console.warn(`Failed to load header settings from backend: ${response.status}`);
          setSelectedHeaders(new Set());
          setEditingThresholds({});
        }
      } catch (apiError) {
        console.error(`Error fetching header settings: ${apiError.message}`);
        setSelectedHeaders(new Set());
        setEditingThresholds({});
      }
    } catch (error) {
      console.error('Error initializing monitored headers:', error);
      setSelectedHeaders(new Set());
      setEditingThresholds({});
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMonitoredHeaders();
  }, [job.projectId, headers]);

  // Save header selection
  const saveHeaderSelection = async (headerId, isSelected, threshold = null) => {
    try {
      // First update local state for immediate feedback
      setSelectedHeaders(prev => {
        const newSelection = new Set(prev);
        if (isSelected) {
          newSelection.add(headerId);
        } else {
          newSelection.delete(headerId);
        }
        return newSelection;
      });

      // Update threshold in local state if provided
      if (threshold !== null) {
        setEditingThresholds(prev => ({
          ...prev,
          [headerId]: threshold
        }));
      }
      
      // Try to send to backend
      console.log(`Saving header selection for ${headerId}: isMonitored=${isSelected}, threshold=${threshold}`);
      
      try {
        const response = await fetch(`${API_CONFIG.baseUrl}/api/settings/header-setting/${headerId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            projectId: projectId,
            headerId: headerId,
            headerName: headers.find(h => h.id === headerId)?.name || 'Unknown Header',
            isMonitored: isSelected,
            threshold: threshold !== null ? threshold : 20, // Default threshold if not provided
            alertDuration: 20, // Default value
            frozenThreshold: 120 // Default value
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Error saving header settings: ${response.status} ${response.statusText}`);
          console.error(`Error details: ${errorText}`);
          console.warn("Header selection saved to local state only");
        } else {
          console.log(`Successfully saved header ${headerId} selection to backend`);
        }
      } catch (apiError) {
        console.error(`API error while saving header selection: ${apiError.message}`);
        console.warn("Header selection saved to local state only");
      }
      
      return true;
    } catch (error) {
      console.error('Error in saveHeaderSelection:', error);
      return false;
    }
  };

  // Toggle individual header monitoring
  const handleToggleHeader = async (headerId) => {
    const isCurrentlySelected = selectedHeaders.has(headerId);
    const newIsSelected = !isCurrentlySelected;
    
    // Save to backend
    const success = await saveHeaderSelection(headerId, newIsSelected);
    
    if (success) {
      setSelectedHeaders(prev => {
        const newSet = new Set(prev);
        if (newIsSelected) {
          newSet.add(headerId);
        } else {
          newSet.delete(headerId);
        }
        return newSet;
      });
    }
  };

  // Save all selected headers using the batch endpoint
  const handleSaveSelection = async () => {
    console.log(`Saving ${selectedHeaders.size} selected headers for project ${projectId}`);
    
    // Create the payload for the batch update
    const allSettings = headers.map(header => ({
      header_id: header.id,
      header_name: header.name || 'Unknown Header',
      is_monitored: selectedHeaders.has(header.id),
      threshold: editingThresholds[header.id] ?? 20, // Use default if not edited
      alert_duration: headerSettings?.[header.id]?.alertDuration ?? 20, // Persist existing or use default
      frozen_threshold: headerSettings?.[header.id]?.frozenThreshold ?? 120 // Persist existing or use default
    }));

    try {
      console.log(`Saving batch settings for ${allSettings.length} headers to project ${projectId}`);
      
      const response = await fetch(`${API_CONFIG.baseUrl}/api/settings/project/${projectId}/headers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          headers: allSettings
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Failed to save all header settings via batch: ${response.status}`);
        console.error(`Error details: ${errorText}`);
        alert(`Failed to save settings: ${errorText}`); // Inform user
      } else {
        console.log("Successfully saved all header settings via batch endpoint");
        // Optionally reload settings or provide success feedback
      }
    } catch (error) {
      console.error("Error saving all header settings via batch:", error);
      alert(`Error saving settings: ${error.message}`); // Inform user
    }
    
    // Exit selection mode regardless of save success/failure for now
    setIsSelectionMode(false);
  };

  // Handle threshold input change
  const handleThresholdInputChange = (headerId, value) => {
    setEditingThresholds(prev => ({
      ...prev,
      [headerId]: value === "" ? "" : Number(value)
    }));
  };

  // Handle threshold changes
  const handleThresholdChange = async (headerId, value) => {
    if (!value || value === '') {
      return;
    }
    
    try {
      // Convert to number
      const numericValue = Number(value);
      if (isNaN(numericValue)) {
        return;
      }
      
      // Update local state
      setEditingThresholds(prev => ({
        ...prev,
        [headerId]: numericValue
      }));
    } catch (error) {
      console.error('Error saving threshold:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 mb-4 flex justify-center items-center h-24">
        <div className="text-gray-500">Loading monitored headers...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-4">
      {/* Job Info and Controls */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold">
            {job.company} - {job.jobName} ({job.wellNumber})
          </h3>
          <p className="text-sm text-gray-600">
            Current Stage: {currentStage.stageName} ({currentStage.stageId})
            {job.stages.length > 1 && (
              <span className="ml-2 text-xs text-blue-600">
                ({job.stages.length} stages in this project)
              </span>
            )}
          </p>
        </div>
        
        {/* Control Buttons */}
        <div className="flex gap-2">
          {!isSelectionMode ? (
            <>
              <button 
                onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                className="p-1.5 text-gray-600 hover:text-blue-600 rounded border"
                title={viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
              >
                {viewMode === 'list' ? <Grid size={16} /> : <List size={16} />}
              </button>
              <button 
                onClick={() => setIsSelectionMode(true)}
                className="p-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded border flex items-center gap-1"
                title="Select headers"
              >
                <Settings size={16} /> Select Headers
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => setIsSelectionMode(false)}
                className="p-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded border"
                title="Cancel"
              >
                <X size={16} /> Cancel
              </button>
              <button 
                onClick={handleSaveSelection}
                className="p-1.5 bg-green-100 text-green-700 hover:bg-green-200 rounded border flex items-center gap-1"
                title="Save selection"
              >
                <Check size={16} /> Save Selection
              </button>
            </>
          )}
        </div>
      </div>

      {/* Header Selection Mode */}
      {isSelectionMode && (
        <div className="mb-4">
          <h4 className="text-sm font-medium mb-2">Select Headers to Monitor:</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
            {headers.map(header => (
              <div 
                key={header.id} 
                className={`p-1.5 border rounded flex items-start hover:bg-gray-50 ${
                  selectedHeaders.has(header.id) ? 'bg-blue-50 border-blue-200' : 'border-gray-200'
                }`}
              >
                <input
                  type="checkbox"
                  id={`sel-header-${header.id}`}
                  checked={selectedHeaders.has(header.id)}
                  onChange={() => handleToggleHeader(header.id)}
                  className="mt-0.5 mr-1.5"
                />
                <label 
                  htmlFor={`sel-header-${header.id}`}
                  className="text-xs cursor-pointer truncate"
                  title={header.name}
                >
                  {header.name}
                </label>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between items-center">
            <span className="text-sm text-gray-600">{selectedHeaders.size} headers selected</span>
            <div className="flex gap-2">
              <button 
                onClick={() => setIsSelectionMode(false)}
                className="p-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded border"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveSelection}
                className="p-1.5 bg-green-100 text-green-700 hover:bg-green-200 rounded border flex items-center gap-1"
              >
                <Check size={16} /> Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Headers Monitoring View */}
      {!isSelectionMode && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {headers.length > 0 ? (
            headers
              .filter(header => selectedHeaders.has(header.id))
              .map(header => {
                // Ensure header ID is a string for consistency
                const headerId = String(header.id);
                const valueData = headerValues[headerId] || { value: null };
                const currentThreshold = headerSettings?.[headerId]?.threshold;
                const headerAlerts = stageAlerts.filter(a => a.headerId === headerId);
                const displayValue = valueData?.value !== null && valueData?.value !== undefined 
                  ? Number(valueData.value).toFixed(2)
                  : (valueData?.error ? <span className="text-red-500 text-xs italic">{valueData.error}</span> : '--');

                return (
                  <div
                    key={header.id}
                    className={`p-2 rounded-md border ${
                      headerAlerts.length > 0 ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <h4 className="font-medium text-sm truncate" title={header.name}>
                            {header.name}
                          </h4>
                          <span className="text-gray-500 text-sm">{displayValue}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="number"
                            className="block w-20 rounded-md border-0 py-1 px-2 text-gray-900 ring-1 ring-inset ring-gray-300 
                              focus:ring-2 focus:ring-inset focus:ring-blue-600 text-sm leading-4"
                            placeholder={currentThreshold?.toString() || "Auto"}
                            value={editingThresholds[headerId] !== undefined ? editingThresholds[headerId] : ''}
                            onChange={(e) => handleThresholdInputChange(headerId, e.target.value)}
                          />
                          <button
                            onClick={() => handleThresholdChange(headerId, editingThresholds[headerId])}
                            disabled={editingThresholds[headerId] === undefined}
                            className={`p-1 rounded-md text-sm ${
                              editingThresholds[headerId] === undefined
                                ? 'text-gray-400 cursor-not-allowed'
                                : 'text-blue-600 hover:bg-blue-50'
                            }`}
                          >
                            <Save className="h-3 w-3" />
                          </button>
                          {headerAlerts.map(alert => (
                            <span
                              key={alert.id}
                              title={alert.message || `Value: ${alert.value}, Threshold: ${alert.threshold}`}
                              className={`px-1.5 py-0.5 rounded text-xs ${
                                alert.type === 'threshold'
                                  ? 'bg-red-100 text-red-800'
                                  : alert.type === 'frozen' 
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {alert.type === 'threshold' ? 'Low' : 
                              alert.type === 'frozen' ? 'Frozen' : 
                              alert.type.charAt(0).toUpperCase() + alert.type.slice(1)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
          ) : (
            <p className="text-sm text-gray-500 italic">No monitorable headers found for this stage.</p>
          )}
        </div>
      )}

      {!isSelectionMode && headers.filter(header => selectedHeaders.has(header.id)).length === 0 && (
        <div className="text-center p-4 border border-dashed rounded-lg">
          <p className="text-gray-500">No headers selected for monitoring</p>
          <button 
            onClick={() => setIsSelectionMode(true)}
            className="mt-2 p-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded border flex items-center gap-1 mx-auto"
          >
            <Settings size={16} /> Select Headers
          </button>
        </div>
      )}
    </div>
  );
});

export default JobMonitoringPanel; 