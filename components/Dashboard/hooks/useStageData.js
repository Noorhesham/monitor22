import { useState, useEffect, useCallback, useRef } from "react";
// import { useSettings } from '../../../../SettingsContext'; // Settings are only used for patterns now
import { matchPatterns } from "../utils/patterns";
import useApi from "./useApi";

// Debug flag
const DEBUG_MODE = true;

/**
 * Custom hook for managing project stages data, including fetching and filtering headers.
 * @param {Object} settings - Application settings containing positive and negative patterns.
 * @returns {Object} Stage data and related functions: stages, activeStageId, stageHeaders, filteredHeaders, loading, error, changeActiveStage, refreshData.
 */
export default function useStageData(settings) {
  const { positivePatterns, negativePatterns } = settings;
  const api = useApi();

  // Add mounted ref to prevent multiple fetches during first render
  const mountedRef = useRef(false);

  // State for stage and header data
  const [allStages, setAllStages] = useState([]); // Holds all fetched active stages
  const [displayStages, setDisplayStages] = useState([]); // Stages to actually render (highest stageId per project, filtered)
  const [activeStageMap, setActiveStageMap] = useState({}); // { projectId: highestStageId }
  const [headersByStage, setHeadersByStage] = useState({}); // { stageId: [headers...] }

  // Combined loading state from the api hook
  const loading = api.loading;
  const [error, setError] = useState(null); // Keep local error state for more specific messages

  /**
   * Filter headers based on positive and negative patterns from settings.
   * @param {Array} headers - The headers to filter.
   * @returns {Array} Filtered headers.
   */
  const filterHeadersByPatterns = useCallback(
    (headers) => {
      if (!headers || !headers.length) return [];

      return headers.filter((header) => {
        const nameLower = header.name?.toLowerCase();
        if (!nameLower) return false; // Skip headers without names

        // Match positive patterns (must match if patterns exist)
        const matchesPositive = positivePatterns.length === 0 || matchPatterns(nameLower, positivePatterns);

        // Match negative patterns (must NOT match)
        const matchesNegative = negativePatterns.length > 0 && matchPatterns(nameLower, negativePatterns);

        return matchesPositive && !matchesNegative;
      });
    },
    [positivePatterns, negativePatterns]
  );

  /**
   * Fetch all active project stages, process them to find the highest stage per project,
   * filter out test projects, and then fetch headers for the resulting stages.
   */
  const fetchAndProcessStages = useCallback(async () => {
    if (DEBUG_MODE) console.log("Fetching and processing stages");

    setError(null); // Clear previous errors

    try {
      // Fetch all active stages
      const stagesData = await api.get("/stages/active/stages");
      if (!stagesData || !Array.isArray(stagesData.stages)) {
        throw new Error("Invalid stages data received from API");
      }
      const fetchedStages = stagesData.stages;

      if (DEBUG_MODE) console.log(`Got ${fetchedStages.length} stages from API`);
      console.log(fetchedStages);
      setAllStages(fetchedStages, "stages");

      // Group stages by project ID
      const groupedByProject = fetchedStages.reduce((acc, stage) => {
        const pid = stage.projectId;
        if (!acc[pid]) acc[pid] = [];
        acc[pid].push(stage);
        return acc;
      }, {});
      console.log(groupedByProject, "grouped by project");

      // Determine the highest (latest) active, non-test stage for each project
      const newActiveStageMap = {};
      const stagesToDisplay = [];
      for (const projectId in groupedByProject) {
        const projectStages = groupedByProject[projectId];
        const highestStage = projectStages.reduce((highest, current) => {
          return !highest || current.stageId > highest.stageId ? current : highest;
        }, null);

        if (highestStage) {
          const combinedName = `${highestStage.projectName || ""} ${highestStage.wellNumber || ""} ${
            highestStage.stageName || ""
          }`.toLowerCase();
          // Filter out stages containing "test"
          if (!combinedName.includes("test")) {
            newActiveStageMap[projectId] = highestStage.stageId;
            stagesToDisplay.push(highestStage);
          }
        }
      }

      setActiveStageMap(newActiveStageMap);
      setDisplayStages(stagesToDisplay); // Set the stages that should be rendered

      if (DEBUG_MODE) console.log(`Displaying ${stagesToDisplay.length} non-test stages`);

      // Fetch headers for these specific stages
      if (stagesToDisplay.length > 0) {
        const headersPromises = stagesToDisplay.map(async (stage) => {
          try {
            const headerData = await api.get(`/stages/${stage.stageId}/headers`);
            const headers = Array.isArray(headerData?.headers)
              ? headerData.headers.map((h) => ({ ...h, value: null, error: false })) // Initialize value/error
              : [];
            return { stageId: stage.stageId, headers: headers };
          } catch (headerError) {
            console.error(`Error fetching headers for stage ${stage.stageId}:`, headerError);
            // Return empty headers for this stage on error, but don't fail the whole process
            return { stageId: stage.stageId, headers: [] };
          }
        });

        const headersResults = await Promise.all(headersPromises);
        const newHeadersByStage = headersResults.reduce((acc, result) => {
          acc[result.stageId] = result.headers;
          return acc;
        }, {});
        setHeadersByStage(newHeadersByStage);
      }
    } catch (err) {
      console.error("Error fetching or processing stage data:", err);
      setError(api.error || err.message || "Failed to fetch project stage data");
      // Reset states on critical failure
      setAllStages([]);
      setDisplayStages([]);
      setActiveStageMap({});
      setHeadersByStage({});
    }
  }, [api]);

  // Initial data loading effect - using the mountedRef to prevent double fetching
  useEffect(() => {
    if (!mountedRef.current) {
      if (DEBUG_MODE) console.log("Initial data fetch on mount");
      fetchAndProcessStages();
      mountedRef.current = true;
    }

    return () => {
      // Clean up on unmount
      if (DEBUG_MODE) console.log("Cleaning up useStageData on unmount");
    };
  }, [fetchAndProcessStages]);

  // The hook now returns the processed data needed by the component.
  // Filtering of headers based on patterns should happen downstream
  // using the `filterHeadersByPatterns` utility or directly in the component.
  return {
    allStages, // All fetched active stages (for reference)
    displayStages, // Filtered, highest stage per project to display
    activeStageMap, // Map of projectId to its highest active stageId
    headersByStage, // Headers keyed by stageId { stageId: [headers...] }
    loading, // Loading state from useApi
    error, // Local error state
    refreshData: fetchAndProcessStages, // Function to manually refresh all data
    filterHeadersByPatterns, // Expose the filtering utility
  };
}
