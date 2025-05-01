import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

export const fetchMonitoredHeaders = createAsyncThunk(
  "monitoredHeaders/fetchMonitoredHeaders",
  async (headerIds = [], { rejectWithValue }) => {
    try {
      let url = `/api/monitoring/monitored-headers`;
      if (headerIds.length > 0) {
        const idsString = headerIds.join(",");
        url += `?headerIds=${idsString}`;
      }
      const response = await axios.get(url);
      console.log("fetchMonitoredHeaders response:", response);

      return response.data;
    } catch (error) {
      console.error("Error in fetchMonitoredHeaders thunk:", error.response?.data || error.message);
      return rejectWithValue(error.response?.data || "Failed to fetch monitored headers");
    }
  }
);

export const addMonitoredHeader = createAsyncThunk(
  "monitoredHeaders/addMonitoredHeader",
  async (
    { stageId, projectId, headerId, headerName, projectName, companyName, settings = {} },
    { rejectWithValue }
  ) => {
    try {
      console.log("Dispatching addMonitoredHeader with:", { projectId, headerId, headerName });
      const response = await axios.post("/api/monitoring/monitored-headers", {
        stageId,
        projectId,
        headerId,
        headerName,
        projectName,
        companyName,
        settings,
      });
      console.log("addMonitoredHeader response:", response.data);
      return response.data;
    } catch (error) {
      console.error("Error in addMonitoredHeader thunk:", error.response?.data || error.message);
      return rejectWithValue(error.response?.data || "Failed to add monitored header");
    }
  }
);

export const removeMonitoredHeader = createAsyncThunk(
  "monitoredHeaders/removeMonitoredHeader",
  async (headerId, { rejectWithValue }) => {
    try {
      await axios.delete(`/api/monitoring/monitored-headers/${headerId}`);
      return headerId;
    } catch (error) {
      return rejectWithValue(error.response?.data || "Failed to remove monitored header");
    }
  }
);

export const removeProjectHeaders = createAsyncThunk(
  "monitoredHeaders/removeProjectHeaders",
  async (projectId, { rejectWithValue }) => {
    try {
      await axios.delete(`/api/monitoring/monitored-headers/project/${projectId}`);
      return projectId;
    } catch (error) {
      return rejectWithValue(error.response?.data || "Failed to remove project headers");
    }
  }
);

export const updateHeaderSettings = createAsyncThunk(
  "monitoredHeaders/updateHeaderSettings",
  async ({ headerId, settings }, { rejectWithValue }) => {
    try {
      const response = await axios.put(`/api/monitoring/monitored-headers/${headerId}/settings`, settings);
      return { headerId, settings: response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data || "Failed to update header settings");
    }
  }
);

export const fetchHeaderValues = createAsyncThunk(
  "monitoredHeaders/fetchHeaderValues",
  async (_, { getState, rejectWithValue }) => {
    try {
      // Get the currently monitored headers from state
      const state = getState();
      const monitoredHeaders = state.monitoredHeaders.monitoredHeaders || [];

      // Extract just the headerIds from monitored headers
      const headerIds = monitoredHeaders.map((header) => header.headerId);

      console.log("Requesting values for specific header IDs:", headerIds);

      const response = await axios.get("/api/monitoring/header-values", {
        params: {
          includeRawData: true, // Always include raw data to get the last value
          headerIds: headerIds.join(","), // Pass the specific headers to monitor
        },
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        return rejectWithValue(error.response.data);
      }
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  monitoredHeaders: [],
  headerValues: [],
  loading: false,
  error: null,
  addingHeader: false,
  addError: null,
  removingHeader: false,
  removeError: null,
  updating: false,
  updateError: null,
};

const monitoredHeadersSlice = createSlice({
  name: "monitoredHeaders",
  initialState,
  reducers: {
    clearMonitoredHeadersError: (state) => {
      state.error = null;
      state.addError = null;
      state.removeError = null;
      state.updateError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMonitoredHeaders.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMonitoredHeaders.fulfilled, (state, action) => {
        // Get the headers array from the response
        const rawHeaders = action.payload.headers || action.payload || [];
        console.log("Header:", rawHeaders);

        // Transform the headers from snake_case to camelCase
        state.monitoredHeaders = rawHeaders.map((header) => {
          // Fetch active project information from backend if needed
          // This is a placeholder - in production, this should come from the backend
          // or you could make a separate API call to fetch this information
          const companyName = header.company_name || "Unknown Company";
          const projectName = header.project_name || "Unknown Project";
          // Create a properly formatted header object
          return {
            id: header.id,
            projectId: header.project_id,
            headerId: header.header_id,
            headerName: header.header_name,
            companyName: companyName,
            projectName: projectName,
            settings: {
              threshold: header.threshold,
              alertDuration: header.alert_duration,
              frozenThreshold: header.frozen_threshold,
            },
            isMonitored: header.is_monitored === 1,
            lastValue: header.last_value,
            lastUpdate: header.last_update,
          };
        });

        state.loading = false;
      })
      .addCase(fetchMonitoredHeaders.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "Failed to fetch monitored headers";
      })
      .addCase(addMonitoredHeader.pending, (state) => {
        state.addingHeader = true;
        state.addError = null;
      })
      .addCase(addMonitoredHeader.fulfilled, (state, action) => {
        const existingIndex = state.monitoredHeaders.findIndex((h) => h.headerId === action.payload.headerId);
        if (existingIndex === -1) {
          state.monitoredHeaders.push(action.payload);
        } else {
          console.warn(`Header ${action.payload.headerId} already exists in monitored list.`);
        }
        state.addingHeader = false;
      })
      .addCase(addMonitoredHeader.rejected, (state, action) => {
        state.addingHeader = false;
        state.addError = action.payload || "Failed to add monitored header";
      })
      .addCase(removeMonitoredHeader.pending, (state, action) => {
        const headerIdToRemove = action.meta.arg;
        state.monitoredHeaders = state.monitoredHeaders.filter((header) => header.headerId !== headerIdToRemove);
        state.removingHeader = true;
        state.removeError = null;
      })
      .addCase(removeMonitoredHeader.fulfilled, (state) => {
        state.removingHeader = false;
      })
      .addCase(removeMonitoredHeader.rejected, (state, action) => {
        state.removingHeader = false;
        state.removeError = action.payload || "Failed to remove monitored header";
        console.error("Failed to remove header, state might be inconsistent.");
      })
      .addCase(removeProjectHeaders.pending, (state, action) => {
        const projectIdToRemove = action.meta.arg;
        state.monitoredHeaders = state.monitoredHeaders.filter((header) => header.projectId !== projectIdToRemove);
        state.removingHeader = true;
        state.removeError = null;
      })
      .addCase(removeProjectHeaders.fulfilled, (state) => {
        state.removingHeader = false;
      })
      .addCase(removeProjectHeaders.rejected, (state, action) => {
        state.removingHeader = false;
        state.removeError = action.payload || "Failed to remove project headers";
        console.error("Failed to remove project headers, state might be inconsistent.");
      })
      .addCase(updateHeaderSettings.pending, (state) => {
        state.updating = true;
        state.updateError = null;
      })
      .addCase(updateHeaderSettings.fulfilled, (state, action) => {
        const { headerId, settings } = action.payload;
        const headerIndex = state.monitoredHeaders.findIndex((header) => header.headerId === headerId);
        if (headerIndex !== -1) {
          state.monitoredHeaders[headerIndex].settings = typeof settings === "object" ? settings : {};
        }
        state.updating = false;
      })
      .addCase(updateHeaderSettings.rejected, (state, action) => {
        state.updating = false;
        state.updateError = action.payload || "Failed to update header settings";
      })
      .addCase(fetchHeaderValues.fulfilled, (state, action) => {
        // Store the header values array directly from the response
        state.headerValues = Array.isArray(action.payload) ? action.payload : [];
        console.log("Header values fetched:", state.headerValues);
        state.loading = false;
      });
  },
});

export const { clearMonitoredHeadersError } = monitoredHeadersSlice.actions;
export default monitoredHeadersSlice.reducer;
