import express from 'express';
import cors from 'cors';
import { initDatabase } from './database/db.js';
import { router as monitoringRoutes } from './routes/monitoring.js';
import { router as projectsRoutes } from './routes/projects.js';
import settingsRouter from './api/settings.js';
import projectRouter from './api/project.js';
import stagesRouter from './api/stages.js';

// Get port from environment variable
const PORT = process.env.MONITOR_API_PORT || 3002;

// Initialize database
console.log('Initializing database...');
try {
  await initDatabase();
  console.log('Database initialized');
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1);
}

// Create Express app
const app = express();

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Register routes
console.log('Registering route: /status -> monitoringRoutes');
app.use('/status', monitoringRoutes);

console.log('Registering route: /api/monitoring -> monitoringRoutes');
app.use('/api/monitoring', monitoringRoutes);

console.log('Registering route: /api/projects -> projectsRoutes');
app.use('/api/projects', projectsRoutes);

console.log('Registering route: /api/settings -> settingsRouter');
app.use('/api/settings', settingsRouter);

console.log('Registering route: /api/settings/project -> projectRouter');
app.use('/api/settings/project', projectRouter);

console.log('Registering route: /api/stages -> stagesRouter');
app.use('/api/stages', stagesRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}`);
});
