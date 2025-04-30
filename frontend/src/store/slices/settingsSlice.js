import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

export const fetchSettings = createAsyncThunk(
  'settings/fetchSettings',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get('/api/settings');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to fetch settings');
    }
  }
);

export const updateSettings = createAsyncThunk(
  'settings/updateSettings',
  async (settings, { rejectWithValue }) => {
    try {
      const response = await axios.post('/api/settings', settings);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to update settings');
    }
  }
);

export const updatePatternCategories = createAsyncThunk(
  'settings/updatePatternCategories',
  async (patternCategories, { rejectWithValue }) => {
    try {
      const response = await axios.post('/api/settings/patterns', { patternCategories });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to update pattern categories');
    }
  }
);

const initialState = {
  settings: {
    pollingInterval: 5,
    patternCategories: {
      pressure: {
        patterns: ['pressure', 'psi'],
        negativePatterns: ['atmospheric', 'atm'],
        threshold: 100,
        alertDuration: 120,
        frozenThreshold: 60
      },
      battery: {
        patterns: ['battery', 'batt', 'volt'],
        threshold: 20,
        alertDuration: 300,
        frozenThreshold: 300
      }
    },
    webhooks: {
      enabled: false,
      slackEnabled: false,
      emailEnabled: false,
      teamsEnabled: false,
      slackWebhookUrl: '',
      emailRecipients: '',
      teamsWebhookUrl: '',
      sendThresholdAlerts: true,
      sendFrozenAlerts: true,
      sendErrorAlerts: true,
      interval: 3600000
    }
  },
  loading: false,
  error: null,
  updated: false
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    clearSettingsError: (state) => {
      state.error = null;
    },
    clearSettingsUpdated: (state) => {
      state.updated = false;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.settings = action.payload;
        state.loading = false;
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch settings';
      })
      .addCase(updateSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.updated = false;
      })
      .addCase(updateSettings.fulfilled, (state, action) => {
        state.settings = action.payload;
        state.loading = false;
        state.updated = true;
      })
      .addCase(updateSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to update settings';
        state.updated = false;
      })
      .addCase(updatePatternCategories.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.updated = false;
      })
      .addCase(updatePatternCategories.fulfilled, (state, action) => {
        state.settings.patternCategories = action.payload.patternCategories;
        state.loading = false;
        state.updated = true;
      })
      .addCase(updatePatternCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to update pattern categories';
        state.updated = false;
      });
  },
});

export const { clearSettingsError, clearSettingsUpdated } = settingsSlice.actions;
export default settingsSlice.reducer; 