import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

export const fetchStageHeaders = createAsyncThunk("headers/fetchStageHeaders", async (stageId, { rejectWithValue }) => {
  try {
    const response = await axios.get(`/api/monitoring/headers/${stageId}`);
    return { stageId, data: response.data };
  } catch (error) {
    return rejectWithValue(error.response?.data || `Failed to fetch headers for stage ${stageId}`);
  }
});

const initialState = {
  byStageId: {}, // { stageId: { headers: [], loading: false, error: null } }
  selectedHeaders: {}, // { stageId: [headerId1, headerId2, ...] }
};

const headersSlice = createSlice({
  name: "headers",
  initialState,
  reducers: {
    selectHeader: (state, action) => {
      const { stageId, headerId } = action.payload;
      if (!state.selectedHeaders[stageId]) {
        state.selectedHeaders[stageId] = [];
      }
      if (!state.selectedHeaders[stageId].includes(headerId)) {
        state.selectedHeaders[stageId].push(headerId);
      }
    },
    deselectHeader: (state, action) => {
      const { stageId, headerId } = action.payload;
      if (state.selectedHeaders[stageId]) {
        state.selectedHeaders[stageId] = state.selectedHeaders[stageId].filter((id) => id !== headerId);
      }
    },
    clearSelectedHeaders: (state, action) => {
      const { stageId } = action.payload;
      state.selectedHeaders[stageId] = [];
    },
    clearHeadersError: (state, action) => {
      const { stageId } = action.payload;
      if (state.byStageId[stageId]) {
        state.byStageId[stageId].error = null;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchStageHeaders.pending, (state, action) => {
        const stageId = action.meta.arg;
        state.byStageId[stageId] = state.byStageId[stageId] || {};
        state.byStageId[stageId].loading = true;
        state.byStageId[stageId].error = null;
      })
      .addCase(fetchStageHeaders.fulfilled, (state, action) => {
        const { stageId, data } = action.payload; // the result of the API call
        const headersArray = data?.headers || [];
        state.byStageId[stageId] = {
          headers: headersArray,
          loading: false,
          error: null,
        };
      })
      .addCase(fetchStageHeaders.rejected, (state, action) => {
        const stageId = action.meta.arg;
        state.byStageId[stageId] = state.byStageId[stageId] || {};
        state.byStageId[stageId].loading = false;
        state.byStageId[stageId].error = action.payload || `Failed to fetch headers for stage ${stageId}`;
      });
  },
});

export const { selectHeader, deselectHeader, clearSelectedHeaders, clearHeadersError } = headersSlice.actions;

export default headersSlice.reducer;
