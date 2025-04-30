# FracBrain Monitoring Dashboard

A React-based dashboard for monitoring FracBrain sensor data in real-time.

## Features

- View active stages and select headers to monitor
- Monitor pressure, battery, and other sensor values
- Configure alert thresholds and durations
- Receive notifications for threshold breaches and frozen data
- Customize monitoring patterns and categories
- Integration with Slack, Email, and Microsoft Teams notifications

## Getting Started

### Prerequisites

- Node.js 16+
- Backend monitoring service running

### Installation

1. Clone the repository
2. Install dependencies:

```bash
cd frontend
npm install
```

3. Create a `.env` file with the following variables (if needed):

```
VITE_API_URL=http://localhost:3002
```

### Development

Run the development server:

```bash
npm run dev
```

This will start the frontend app at http://localhost:3000.

### Building for Production

Build the app for production:

```bash
npm run build
```

The build artifacts will be stored in the `dist/` directory.

## Backend Integration

This frontend is designed to communicate with the backend monitoring service API. Make sure the backend is running and the API URL is correctly set in the `.env` file or in the `vite.config.js` file.

## Project Structure

- `src/components/`: React components
- `src/pages/`: Page components
- `src/store/`: Redux store configuration and slices
- `src/api/`: API service functions
- `src/utils/`: Utility functions
- `src/styles/`: Global styles
- `src/assets/`: Static assets

## License

This project is proprietary software. 