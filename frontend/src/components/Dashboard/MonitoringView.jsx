import React, { useState, useEffect } from 'react';
import { Box, Card, Typography, Alert } from '@mui/material';
import { HeaderSettingsService } from '../../services/headerSettingsService.js';
import { useSelector } from 'react-redux';

export default function MonitoringView({ headers }) {
  const [headerValues, setHeaderValues] = useState({});
  const [alerts, setAlerts] = useState([]);
  const { settings } = useSelector(state => state.settings);

  useEffect(() => {
    const fetchHeaderValues = async () => {
      try {
        const values = {};
        for (const header of headers) {
          const value = await HeaderSettingsService.getHeaderValue(header.projectId, header.id);
          values[header.id] = value;
        }
        setHeaderValues(values);
      } catch (error) {
        console.error('Error fetching header values:', error);
      }
    };

    // Initial fetch
    fetchHeaderValues();

    // Get polling interval from settings (default to 5 seconds)
    const pollingIntervalMs = (settings?.pollingInterval || 5) * 1000;
    console.log(`MonitoringView setting up polling interval: ${pollingIntervalMs}ms`);

    // Set up polling with the configured interval
    const interval = setInterval(fetchHeaderValues, pollingIntervalMs);

    return () => clearInterval(interval);
  }, [headers, settings?.pollingInterval]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Monitored Headers</Typography>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Box sx={{ mb: 2 }}>
          {alerts.map((alert, index) => (
            <Alert 
              key={index} 
              severity={alert.type} 
              sx={{ mb: 1 }}
              onClose={() => setAlerts(prev => prev.filter((_, i) => i !== index))}
            >
              {alert.message}
            </Alert>
          ))}
        </Box>
      )}

      {/* Headers Section */}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {headers.map(header => (
          <Card key={header.id} sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>{header.name}</Typography>
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography color="textSecondary">Current Value:</Typography>
              <Typography>{headerValues[header.id]?.value || 'N/A'}</Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography color="textSecondary">Threshold:</Typography>
              <Typography>{header.threshold}</Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography color="textSecondary">Alert Duration:</Typography>
              <Typography>{header.alertDuration}s</Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography color="textSecondary">Frozen Threshold:</Typography>
              <Typography>{header.frozenThreshold}s</Typography>
            </Box>
          </Card>
        ))}
      </Box>
    </Box>
  );
} 