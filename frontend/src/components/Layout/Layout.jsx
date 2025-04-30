import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Box, 
  Drawer, 
  AppBar, 
  Toolbar, 
  Typography, 
  Divider, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText, 
  IconButton, 
  Tooltip,
  Badge
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import SettingsIcon from '@mui/icons-material/Settings';
import NotificationsIcon from '@mui/icons-material/Notifications';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useSelector, useDispatch } from 'react-redux';
import { fetchActiveStages } from '../../store/slices/stagesSlice';
import { fetchAlerts } from '../../store/slices/alertsSlice';
import { fetchHeaderValues } from '../../store/slices/monitoredHeadersSlice';
import AlertsSidebar from '../Alerts/AlertsSidebar';
import ProjectsSidebar from '../Projects/ProjectsSidebar';

const drawerWidth = 260;
const alertsDrawerWidth = 350; // Width of the alerts sidebar

const Layout = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const dispatch = useDispatch();
  const alerts = useSelector(state => state.alerts.alerts);

  // Auto refresh alerts every minute
  useEffect(() => {
    const interval = setInterval(() => {
      dispatch(fetchAlerts());
    }, 60000); // 1 minute
    
    return () => clearInterval(interval);
  }, [dispatch]);

  // Initial load of alerts
  useEffect(() => {
    dispatch(fetchAlerts());
  }, [dispatch]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleRefresh = () => {
    dispatch(fetchActiveStages());
    dispatch(fetchAlerts());
    dispatch(fetchHeaderValues());
  };

  const activeAlertsCount = Array.isArray(alerts) ? alerts.length : 0;

  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          FracBrain Monitor
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        <ListItem 
          button 
          component={Link} 
          to="/dashboard" 
          selected={location.pathname === '/dashboard'}
        >
          <ListItemIcon>
            <DashboardIcon />
          </ListItemIcon>
          <ListItemText primary="Dashboard" />
        </ListItem>
        <ListItem 
          button 
          component={Link} 
          to="/monitored-headers" 
          selected={location.pathname === '/monitored-headers'}
        >
          <ListItemIcon>
            <MonitorHeartIcon />
          </ListItemIcon>
          <ListItemText primary="Monitored Headers" />
        </ListItem>
        <ListItem 
          button 
          component={Link} 
          to="/settings" 
          selected={location.pathname === '/settings'}
        >
          <ListItemIcon>
            <SettingsIcon />
          </ListItemIcon>
          <ListItemText primary="Settings" />
        </ListItem>
      </List>
      <Divider />
      <ProjectsSidebar />
    </div>
  );

  return (
    <>
      <Box sx={{ display: 'flex' }}>
        <AppBar
          position="fixed"
          sx={{
            width: { sm: `calc(100% - ${drawerWidth}px - ${alertsDrawerWidth}px)` },
            ml: { sm: `${drawerWidth}px` },
            mr: { sm: `${alertsDrawerWidth}px` }
          }}
        >
          <Toolbar>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { sm: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
              {location.pathname === '/dashboard' && 'Dashboard'}
              {location.pathname === '/monitored-headers' && 'Monitored Headers'}
              {location.pathname === '/settings' && 'Settings'}
            </Typography>
            <Tooltip title="Refresh data">
              <IconButton 
                color="inherit" 
                onClick={handleRefresh}
                sx={{ mr: 1 }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Alerts">
              <IconButton color="inherit">
                <Badge badgeContent={activeAlertsCount} color="error">
                  <NotificationsIcon />
                </Badge>
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{ 
          flexGrow: 1, 
          p: 3, 
          width: { sm: `calc(100% - ${drawerWidth}px - ${alertsDrawerWidth}px)` }, 
          marginLeft: { sm: `${drawerWidth}px` },
          marginRight: { sm: `${alertsDrawerWidth}px` },
          marginTop: '64px',
          height: 'calc(100vh - 64px)',
          overflow: 'auto'
        }}
      >
        {children}
      </Box>
      <AlertsSidebar open={true} />
    </>
  );
};

export default Layout; 