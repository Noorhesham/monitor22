import { useState, useEffect, useCallback, useRef, useMemo } from "react";
// import { useSettings } from '../../../../SettingsContext'; // Settings are only used for patterns now
import { matchPatterns, categorizeHeader } from "../utils/patterns";
import useApi from "./useApi";

// Debug flag
const DEBUG_MODE = true;

/**
 * Custom hook for managing project stages data and active jobs
 * @param {Object} settings Application settings
 * @returns {Object} Stage data and related functions
 */
export default function useStageData(settings) {
  const api = useApi();
  const mountedRef = useRef(false);
  const previousProjectStagesRef = useRef({}); // Track previous stages by projectId

  // State for stage and header data
  const [allStages, setAllStages] = useState([]);
  const [activeJobs, setActiveJobs] = useState({});
  const [headersByStage, setHeadersByStage] = useState({});
  const [headerMappings, setHeaderMappings] = useState({});
  const [allHeadersByStage, setAllHeadersByStage] = useState({});
  const [projectStages, setProjectStages] = useState({}); // Track all stages by projectId

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Memoize settings with deep comparison
   */
  const memoizedSettings = useMemo(() => {
    // Only return new settings object if critical properties changed
    return {
      patternCategories: settings?.patternCategories || {}
    };
  }, [
    JSON.stringify(settings?.patternCategories)
  ]);

  /**
   * Filter headers based on pattern categories from settings
   */
  const filterHeaders = useCallback((headers, forSettings = false) => {
    console.log(`[filterHeaders] Called with ${headers?.length || 0} headers. forSettings: ${forSettings}`);
    if (!headers?.length) return [];
    
    // For Settings page, we want to return all headers for display
    if (forSettings) {
      return headers.filter(header => {
        // Only basic filtering for Settings page
        if (isNaN(parseInt(header.id, 10))) return false;
        if (!header.name) return false;
        if (header.type !== 'FIELD') return false;
        
        // Exclude specific unwanted headers
        const lowerCaseName = header.name.toLowerCase();
        const excludeKeywords = ['qc', 'test', 'debug', 'log', 'raw'];
        if (excludeKeywords.some(keyword => lowerCaseName.includes(keyword))) {
          return false;
        }
        
        return true;
      });
    }
    
    // For Dashboard, apply strict pattern filtering using settings
    if (!forSettings) {
      console.log(`[filterHeaders - Dashboard] Input headers count: ${headers.length}`);
      console.log(`[filterHeaders - Dashboard] Using settings:`, memoizedSettings);
    }
    // Check if we have valid pattern categories to filter with
    const hasPatternCategories = memoizedSettings?.patternCategories &&
      memoizedSettings.patternCategories.pressure?.patterns?.length > 0;
    
    if (DEBUG_MODE) {
      console.log("-------- Header Filtering Debug --------");
      console.log("Pattern categories available:", hasPatternCategories);
      if (hasPatternCategories) {
        console.log("Pressure patterns:", memoizedSettings.patternCategories.pressure.patterns);
        console.log("Pressure negative patterns:", memoizedSettings.patternCategories.pressure.negativePatterns);
        console.log("Battery patterns:", memoizedSettings.patternCategories.battery?.patterns);
      }
      console.log("Headers before filtering:", headers.length);
      console.log("Sample headers:", headers.slice(0, 3).map(h => h.name));
    }
    
    // If we don't have valid pattern categories, use default pressure detection
    if (!hasPatternCategories) {
      console.warn("No valid pattern categories defined, using default pressure detection");
      
      const defaultFiltered = headers.filter(header => {
        // Basic check: only allow headers with numeric IDs
        if (isNaN(parseInt(header.id, 10))) return false;
        
        // Skip headers without names
        if (!header.name) return false;

        // Skip headers that are not of type FIELD
        if (header.type !== 'FIELD') return false;

        const lowerCaseName = header.name.toLowerCase();
        
        // Skip headers with specific keywords that indicate they're not for monitoring
        const excludeKeywords = ['qc', 'test', 'debug', 'log', 'raw'];
        if (excludeKeywords.some(keyword => lowerCaseName.includes(keyword))) {
          return false;
        }
        
        // Default pressure keywords to detect headers
        const pressureKeywords = ['pressure', 'psi', 'tubing', 'casing', 'annulus', 'treating'];
        const batteryKeywords = ['battery', 'batt', 'power', 'volt'];
        
        // Include headers that contain pressure or battery keywords
        const included = pressureKeywords.some(keyword => lowerCaseName.includes(keyword)) ||
                       batteryKeywords.some(keyword => lowerCaseName.includes(keyword));
        if (!included) console.log(`[filterHeaders - Default] Excluding: ${header.name}`);
        return included;
      });
      if (!forSettings) console.log(`[filterHeaders - Dashboard - Default] Output headers count: ${defaultFiltered.length}`);
      return defaultFiltered;
    }
    
    // Use the configured pattern categories for filtering with stricter matching
    const filteredHeaders = headers.filter(header => {
      // Basic check: only allow headers with numeric IDs
      if (isNaN(parseInt(header.id))) return false;
      
      // Skip headers without names
      if (!header.name) return false;

      // Skip headers that are not of type FIELD
      if (header.type !== 'FIELD') return false;

      const lowerCaseName = header.name.toLowerCase();
      
      // Skip headers with specific keywords that indicate they're not for monitoring
      const excludeKeywords = ['qc', 'test', 'debug', 'log', 'raw'];
      if (excludeKeywords.some(keyword => lowerCaseName.includes(keyword))) {
        return false;
      }
      
      // Check pressure category
      if (memoizedSettings.patternCategories.pressure) {
        const { patterns, negativePatterns } = memoizedSettings.patternCategories.pressure;
        
        // First check negative patterns - if any match, exclude this header
        if (negativePatterns && negativePatterns.length > 0) {
          if (negativePatterns.some(pattern => lowerCaseName.includes(pattern.toLowerCase()))) {
            if (DEBUG_MODE) {
              console.log(`Header ${header.name} excluded by negative pattern`);
            }
            return false;
          }
        }
        
        // Then check positive patterns - if any match, include this header
        if (patterns && patterns.length > 0) {
          if (patterns.some(pattern => lowerCaseName.includes(pattern.toLowerCase()))) {
            if (DEBUG_MODE) {
              console.log(`Header ${header.name} included by pressure pattern`);
            }
            return true;
          }
        }
      }
      
      // Check battery category 
      if (memoizedSettings.patternCategories.battery) {
        const { patterns } = memoizedSettings.patternCategories.battery;
        if (patterns && patterns.length > 0) {
          if (patterns.some(pattern => lowerCaseName.includes(pattern.toLowerCase()))) {
            if (DEBUG_MODE) {
              console.log(`Header ${header.name} included by battery pattern`);
            }
            return true;
          }
        }
      }
      
      // If we get here, no patterns matched
      if (DEBUG_MODE) {
        console.log(`Header ${header.name} excluded - no matching patterns`);
      }
      return false;
    });
    
    if (DEBUG_MODE && !forSettings) {
      console.log(`Filtered ${headers.length} headers down to ${filteredHeaders.length} headers`);
      console.log("Filtered headers sample:", filteredHeaders.slice(0, 5).map(h => h.name));
      if (headers.length > 0 && filteredHeaders.length === 0) {
        console.warn(`[filterHeaders - Dashboard] All headers were filtered out by pattern matching! Check patterns in settings.`);
      }
      console.log("-------- End Header Filtering Debug --------");
    }
    
    return filteredHeaders;
  }, [memoizedSettings]);

  /**
   * Process stages to group by project and track stage transitions
   */
  const processStages = useCallback(async (stages) => {
    const newActiveJobs = {};
    const newHeaderMappings = {};
    const newHeadersByStage = {};
    const newAllHeadersByStage = {};
    const newProjectStages = {};

    // First, group stages by projectId and find the latest one for each project
    stages.forEach(stage => {
      const { projectId, projectName, companyId, companyName, companyShortName, wellNumber } = stage;
      
      if (!newProjectStages[projectId]) {
        newProjectStages[projectId] = [];
      }
      newProjectStages[projectId].push(stage);

      // Update active project in local database, not in FracBrain API
      // Just use our backend proxy for this, not the FracBrain API directly
      fetch('/api/projects/active', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId,
          companyId,
          companyName,
          companyShortName,
          projectName
        })
      }).catch(err => {
        console.warn('Error updating active project in local DB:', err);
      });
    });

    // Process each project's stages
    for (const [projectId, projectStages] of Object.entries(newProjectStages)) {
      // Sort stages by createdAt timestamp (newest first)
      const sortedStages = projectStages.sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      );

      const latestStage = sortedStages[0];
      const previousStages = previousProjectStagesRef.current[projectId] || [];
      
      // Check if this is a new stage for this project
      const isNewStage = !previousStages.find(ps => ps.stageId === latestStage.stageId);
      
      if (isNewStage && DEBUG_MODE) {
        console.log(`New stage detected for project ${projectId}:`, {
          previousStage: previousStages[0]?.stageName,
          newStage: latestStage.stageName
        });
      }

      // Create job entry using latest stage
      const jobId = `${latestStage.companyName}_${latestStage.projectName}_${latestStage.wellNumber}`.toLowerCase();
      newActiveJobs[jobId] = {
        jobId,
        projectId: latestStage.projectId,
        companyId: latestStage.companyId,
        company: latestStage.companyName,
        companyShortName: latestStage.companyShortName,
        jobName: latestStage.projectName,
        wellNumber: latestStage.wellNumber,
        stages: sortedStages, // Keep all stages but use latest as current
        currentStage: latestStage
      };

      try {
        // Fetch headers for the latest stage
        const response = await api.get(`/stages/${latestStage.stageId}/headers`);
        if (response && response.headers) {
          const allHeaders = filterHeaders(response.headers, true);
          newAllHeadersByStage[latestStage.stageId] = allHeaders;

          const headers = filterHeaders(response.headers);
          if (headers.length > 0) {
            newHeadersByStage[latestStage.stageId] = headers;
            
            // Update header mappings with project information
            headers.forEach(header => {
              if (!newHeaderMappings[header.id]) {
                newHeaderMappings[header.id] = {
                  stages: [],
                  currentStageId: latestStage.stageId,
                  projectId: latestStage.projectId,
                  jobId: jobId,
                  name: header.name
                };
              }
              newHeaderMappings[header.id].stages.push(latestStage.stageId);
            });

            // Instead of fetching from an API that doesn't exist,
            // load the settings from localStorage or initialize them
            const settingsKey = `headerSettings_${projectId}`;
            try {
              const savedSettings = localStorage.getItem(settingsKey);
              if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                // Apply the saved settings to the headers
                headers.forEach(header => {
                  const savedHeader = parsedSettings.find(h => h.header_id === header.id);
                  if (savedHeader) {
                    header.threshold = savedHeader.threshold;
                    header.isMonitored = savedHeader.is_monitored;
                  }
                });
              }
            } catch (error) {
              console.warn(`Could not load header settings for project ${projectId} from localStorage`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching headers for stage ${latestStage.stageId}:`, error);
      }
    }

    // Update refs and state
    previousProjectStagesRef.current = newProjectStages;
    setProjectStages(newProjectStages);
    setActiveJobs(newActiveJobs);
    setHeaderMappings(newHeaderMappings);
    setHeadersByStage(newHeadersByStage);
    setAllHeadersByStage(newAllHeadersByStage);
  }, [api, filterHeaders]);

  /**
   * Fetch and process all active stages
   */
  const fetchAndProcessStages = useCallback(async () => {
    if (DEBUG_MODE) console.log("Fetching and processing stages");
    
    setLoading(true);
    setError(null);

    try {
      const stagesData = await api.get("/stages/active/stages");
      
      if (!stagesData?.stages) {
        throw new Error("Invalid stages data received from API");
      }

      const activeStages = stagesData.stages.filter(stage => {
        const combinedName = `${stage.projectName} ${stage.wellNumber} ${stage.stageName}`.toLowerCase();
        return !combinedName.includes("test");
      });

      setAllStages(activeStages);
      await processStages(activeStages);

    } catch (err) {
      console.error("Error fetching or processing stage data:", err);
      setError(err.message || "Failed to fetch project stage data");
      setAllStages([]);
      setActiveJobs({});
      setHeadersByStage({});
      setHeaderMappings({});
      setAllHeadersByStage({});
      setProjectStages({});
    } finally {
      setLoading(false);
    }
  }, [api, processStages]);

  // Initial data loading
  useEffect(() => {
    if (!mountedRef.current) {
      fetchAndProcessStages();
      mountedRef.current = true;
    }
  }, [fetchAndProcessStages]);

  // Periodic refresh
  useEffect(() => {
    // const interval = setInterval(fetchAndProcessStages, 60000); // Removed periodic refresh
    // return () => clearInterval(interval);
  }, [fetchAndProcessStages]);

  // Effect to re-process headers when settings change after initial load
  const prevDeps = useRef({ memoizedSettings, loading, activeJobs, allHeadersByStage, filterHeaders });
  useEffect(() => {
    const currentDeps = { memoizedSettings, loading, activeJobs, allHeadersByStage, filterHeaders };
    if (!loading && Object.keys(activeJobs).length > 0 && memoizedSettings) {
      // Log which dependency changed
      const changedDeps = Object.keys(currentDeps).filter(
        key => prevDeps.current[key] !== currentDeps[key]
      );

      if (changedDeps.length > 0) {
        console.log("[useStageData - Settings Effect Triggered] Changed dependencies:", changedDeps.join(', '));
        // Optional: Log the actual values for deep comparison if needed
        // changedDeps.forEach(key => console.log(`  ${key}:`, { prev: prevDeps.current[key], current: currentDeps[key] }));
      } else {
        console.log("[useStageData - Settings Effect Triggered] No dependency change detected (should not happen often). Re-processing anyway.")
      }

      console.log("[useStageData] Re-processing headers for dashboard panels.");
      const updatedHeadersByStage = {};
      for (const stageId in allHeadersByStage) {
        updatedHeadersByStage[stageId] = filterHeaders(allHeadersByStage[stageId], false);
      }
      setHeadersByStage(updatedHeadersByStage);
    }

    // Update previous dependencies ref
    prevDeps.current = currentDeps;
  }, [memoizedSettings, loading, activeJobs, allHeadersByStage, filterHeaders]);

  return {
    allStages,
    activeJobs,
    headersByStage,
    headerMappings,
    allHeadersByStage,
    projectStages, // Expose project stages mapping
    loading,
    error,
    refreshData: fetchAndProcessStages
  };
}

export async function fetchActiveStages() {
  console.log('Fetching and processing stages');
  try {
    // Use the proxy path instead of directly calling the API
    const response = await fetch('/api/stages/active/stages');
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching or processing stage data:', error);
    throw error;
  }
}

