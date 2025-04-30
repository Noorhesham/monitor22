import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

export const fetchActiveStages = createAsyncThunk("stages/fetchActiveStages", async (_, { rejectWithValue }) => {
  try {
    const response = await axios.get("/api/monitoring/active-stages");
    return response.data;
  } catch (error) {
    return rejectWithValue(error.response?.data || "Failed to fetch active stages");
  }
});

const initialState = {
  activeStages: [],
  loading: false,
  error: null,
};

const stagesSlice = createSlice({
  name: "stages",
  initialState,
  reducers: {
    clearStagesError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchActiveStages.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchActiveStages.fulfilled, (state, action) => {
        state.activeStages = action.payload.stages || action.payload || [];
        console.log("action.payload of fetchActiveStages", action.payload);
        state.loading = false;
      })
      .addCase(fetchActiveStages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "Failed to fetch active stages";
      });
  },
});

export const { clearStagesError } = stagesSlice.actions;
export default stagesSlice.reducer;
