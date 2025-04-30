import React, { useState, useEffect } from 'react';
import { Box, Button, Card, Checkbox, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from '@mui/material';
import useStageData from './hooks/useStageData';
import { HeaderSettingsService } from '../../services/headerSettingsService.js';

export default function HeaderSelector({ onHeadersConfigured }) {
  const { allStages, headersByStage, loading, error } = useStageData({});
  const [selectedStageId, setSelectedStageId] = useState('');
  const [selectedHeaders, setSelectedHeaders] = useState([]);
  const [headerConfigs, setHeaderConfigs] = useState({});

  // Handle stage selection
  const handleStageSelect = (event) => {
    setSelectedStageId(event.target.value);
    setSelectedHeaders([]);
    setHeaderConfigs({});
  };

  // Handle header selection
  const handleHeaderSelect = (headerId) => {
    setSelectedHeaders(prev => {
      if (prev.includes(headerId)) {
        return prev.filter(id => id !== headerId);
      }
      return [...prev, headerId];
    });

    // Initialize config for newly selected header
    if (!headerConfigs[headerId]) {
      setHeaderConfigs(prev => ({
        ...prev,
        [headerId]: {
          threshold: 0,
          alertDuration: 300, // 5 minutes default
          frozenThreshold: 600, // 10 minutes default
          isMonitored: true
        }
      }));
    }
  };

  // Handle config changes
  const handleConfigChange = (headerId, field, value) => {
    setHeaderConfigs(prev => ({
      ...prev,
      [headerId]: {
        ...prev[headerId],
        [field]: value
      }
    }));
  };

  // Save configurations
  const handleSave = async () => {
    const stage = allStages.find(s => s.stageId === selectedStageId);
    if (!stage) return;

    const headers = headersByStage[selectedStageId] || [];
    const selectedHeadersData = headers
      .filter(h => selectedHeaders.includes(h.id))
      .map(header => ({
        id: header.id,
        name: header.name,
        ...headerConfigs[header.id]
      }));

    try {
      await HeaderSettingsService.updateProjectHeaderSettings(stage.projectId, selectedHeadersData);
      if (onHeadersConfigured) {
        onHeadersConfigured(selectedHeadersData);
      }
    } catch (error) {
      console.error('Error saving header configurations:', error);
    }
  };

  if (loading) return <Typography>Loading stages...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>Configure Headers to Monitor</Typography>
      
      {/* Stage Selection */}
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Select Stage</InputLabel>
        <Select
          value={selectedStageId}
          onChange={handleStageSelect}
          label="Select Stage"
        >
          {allStages.map(stage => (
            <MenuItem key={stage.stageId} value={stage.stageId}>
              {stage.projectName} - {stage.stageName}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Header Selection */}
      {selectedStageId && headersByStage[selectedStageId] && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6" gutterBottom>Available Headers</Typography>
          {headersByStage[selectedStageId].map(header => (
            <Card key={header.id} sx={{ mb: 1, p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Checkbox
                  checked={selectedHeaders.includes(header.id)}
                  onChange={() => handleHeaderSelect(header.id)}
                />
                <Typography>{header.name}</Typography>
              </Box>
              
              {selectedHeaders.includes(header.id) && (
                <Box sx={{ pl: 4 }}>
                  <TextField
                    label="Threshold"
                    type="number"
                    value={headerConfigs[header.id]?.threshold || 0}
                    onChange={(e) => handleConfigChange(header.id, 'threshold', Number(e.target.value))}
                    sx={{ mr: 2 }}
                  />
                  <TextField
                    label="Alert Duration (seconds)"
                    type="number"
                    value={headerConfigs[header.id]?.alertDuration || 300}
                    onChange={(e) => handleConfigChange(header.id, 'alertDuration', Number(e.target.value))}
                    sx={{ mr: 2 }}
                  />
                  <TextField
                    label="Frozen Threshold (seconds)"
                    type="number"
                    value={headerConfigs[header.id]?.frozenThreshold || 600}
                    onChange={(e) => handleConfigChange(header.id, 'frozenThreshold', Number(e.target.value))}
                  />
                </Box>
              )}
            </Card>
          ))}
        </Box>
      )}

      {/* Save Button */}
      <Button
        variant="contained"
        color="primary"
        onClick={handleSave}
        disabled={selectedHeaders.length === 0}
      >
        Start Monitoring Selected Headers
      </Button>
    </Box>
  );
} 