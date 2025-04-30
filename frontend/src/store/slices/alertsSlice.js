import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

export const fetchAlerts = createAsyncThunk(
  'alerts/fetchAlerts',
  async (includeSnoozed = false, { rejectWithValue }) => {
    try {
      const response = await axios.get('/api/monitoring/alerts', {
        params: { includeSnoozed: includeSnoozed ? 'true' : 'false' }
      });
      
      return response.data.alerts || [];
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to fetch alerts');
    }
  }
);

export const snoozeAlert = createAsyncThunk(
  'alerts/snoozeAlert',
  async ({ alertId, duration }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`/api/monitoring/alerts/${alertId}/snooze`, { duration });
      return { alertId, data: response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to snooze alert');
    }
  }
);

export const dismissAlert = createAsyncThunk(
  'alerts/dismissAlert',
  async (alertId, { rejectWithValue }) => {
    try {
      await axios.delete(`/api/monitoring/alerts/${alertId}`);
      return alertId;
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to dismiss alert');
    }
  }
);

const initialState = {
  alerts: [],
  loading: false,
  error: null,
};

const alertsSlice = createSlice({
  name: 'alerts',
  initialState,
  reducers: {
    clearAlertsError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAlerts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAlerts.fulfilled, (state, action) => {
        state.alerts = action.payload;
        state.loading = false;
        console.log('action.payload of fetchAlerts', action.payload);
      })
      .addCase(fetchAlerts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch alerts';
      })
      .addCase(snoozeAlert.fulfilled, (state, action) => {
        const { alertId, data } = action.payload;
        const alertIndex = state.alerts.findIndex(alert => alert.id === alertId);
        if (alertIndex !== -1) {
          state.alerts[alertIndex] = { ...state.alerts[alertIndex], ...data };
        }
      })
      .addCase(dismissAlert.fulfilled, (state, action) => {
        state.alerts = state.alerts.filter(alert => alert.id !== action.payload);
      });
  },
});

export const { clearAlertsError } = alertsSlice.actions;
export default alertsSlice.reducer; 