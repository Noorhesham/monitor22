import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { main as startMonitorService, getConfig } from "./monitorService.js";
import { router as monitoringRoutes } from "./routes/monitoring.js";
import { router as settingsRouter } from "./routes/settings.js";

// Load environment variables
dotenv.config();

// Initialize the monitoring service
console.log("Starting Monitor Service...");
const monitorServiceStarted = await startMonitorService();
if (!monitorServiceStarted) {
  console.error("Failed to start monitoring service");
  process.exit(1);
}

// Get port from environment variable
const PORT = process.env.MONITOR_API_PORT || 3002;

// Create Express app
const app = express();

// Enable CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3001",
    credentials: true,
  })
);

// Parse JSON bodies
app.use(express.json());

// Register routes
console.log("Registering routes...");
app.use("/status", (req, res) => {
  res.json({
    status: "running",
    monitorService: monitorServiceStarted ? "active" : "inactive",
    version: "1.0.0",
  });
});

app.use("/monitoring", monitoringRoutes);
app.use("/settings", settingsRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}`);
});
