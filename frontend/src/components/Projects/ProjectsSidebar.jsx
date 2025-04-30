import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Collapse,
  Typography,
  CircularProgress,
  Alert,
  Divider,
  Button
} from '@mui/material';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';
import { fetchActiveStages } from '../../store/slices/stagesSlice';
import { fetchMonitoredHeaders } from '../../store/slices/monitoredHeadersSlice';
import { Link } from 'react-router-dom';

const ProjectsSidebar = () => {
  const dispatch = useDispatch();
  const { activeStages, loading, error } = useSelector(state => state.stages);
  const { monitoredHeaders } = useSelector(state => state.monitoredHeaders);
  const [expandedProjects, setExpandedProjects] = React.useState({});

  useEffect(() => {
    dispatch(fetchActiveStages());
  }, [dispatch]);

  const toggleProject = (projectId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  };

  // Ensure monitoredHeaders is always an array
  const safeMonitoredHeaders = Array.isArray(monitoredHeaders) ? monitoredHeaders : [];
  
  // Group monitored headers by project
  const monitoredHeadersByProject = safeMonitoredHeaders.reduce((acc, header) => {
    // Ensure header and projectId exist before processing
    if (header && header.projectId) {
      if (!acc[header.projectId]) {
        acc[header.projectId] = [];
      }
      acc[header.projectId].push(header);
    }
    return acc;
  }, {});

  // Count monitored headers by project
  const getMonitoredHeaderCount = (projectId) => {
    return monitoredHeadersByProject[projectId]?.length || 0;
  };

  // Helper to display error message
  const renderErrorMessage = (err) => {
    if (!err) return null;
    if (typeof err === 'string') return err;
    if (err.error) return `${err.error}${err.details ? `: ${err.details}` : ''}`;
    return JSON.stringify(err);
  };

  return (
    <Box>
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle1" fontWeight="bold">
          Active Projects
        </Typography>
        <Button 
          component={Link} 
          to="/dashboard" 
          color="primary" 
          size="small"
        >
          View All
        </Button>
      </Box>
      
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}
      
      {error && (
        <Box sx={{ p: 2 }}>
          <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
            {renderErrorMessage(error)}
          </Alert>
        </Box>
      )}
      
      <List dense disablePadding>
        {Array.isArray(activeStages) && activeStages.map((stage) => {
          // Ensure stage object and projectId are valid before rendering
          if (!stage || !stage.projectId) return null;
          
          const isExpanded = expandedProjects[stage.projectId] || false;
          const monitoredCount = getMonitoredHeaderCount(stage.projectId);
          
          // Use stageId as the key, which should be unique
          return (
            <React.Fragment key={stage.stageId}>
              <ListItemButton onClick={() => toggleProject(stage.projectId)}>
                <ListItemIcon>
                  <FolderIcon color={monitoredCount > 0 ? 'primary' : 'action'} />
                </ListItemIcon>
                <ListItemText 
                  primary={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" noWrap sx={{ maxWidth: '150px' }}>
                        {stage.projectName || stage.stageName || `Project ${stage.projectId}`}
                      </Typography>
                      {monitoredCount > 0 && (
                        <Typography variant="caption" sx={{ color: 'primary.main' }}>
                          {monitoredCount} monitored
                        </Typography>
                      )}
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {stage.companyName || 'Unknown Company'} - Stage {stage.stageNumber || 'N/A'}
                    </Typography>
                  }
                />
                {isExpanded ? <ExpandLess /> : <ExpandMore />}
              </ListItemButton>
              
              <Collapse in={isExpanded} timeout="auto">
                <List dense disablePadding>
                  {monitoredHeadersByProject[stage.projectId]?.map((header) => (
                    // Ensure header object and headerId are valid
                    header && header.headerId ? (
                      <ListItemButton 
                        key={header.headerId} 
                        sx={{ pl: 4 }}
                        component={Link}
                        to="/monitored-headers"
                      >
                        <ListItemText 
                          primary={
                            <Typography variant="body2" noWrap>
                              {header.headerName || 'Unnamed Header'}
                            </Typography>
                          }
                        />
                      </ListItemButton>
                    ) : null
                  ))}
                  
                  {(!monitoredHeadersByProject[stage.projectId] || monitoredHeadersByProject[stage.projectId].length === 0) && (
                    <ListItemButton 
                      sx={{ pl: 4 }}
                      component={Link}
                      to="/dashboard"
                    >
                      <ListItemText 
                        primary={
                          <Typography variant="body2" color="text.secondary">
                            Add monitored headers
                          </Typography>
                        }
                      />
                    </ListItemButton>
                  )}
                </List>
              </Collapse>
              <Divider />
            </React.Fragment>
          );
        })}
      </List>
      
      {!loading && !error && (!Array.isArray(activeStages) || activeStages.length === 0) && (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary" align="center">
            No active projects found
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ProjectsSidebar; 