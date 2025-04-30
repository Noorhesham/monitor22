# FracBrain Monitor Backend

## Overview
This is the backend service for FracBrain Monitor, responsible for monitoring headers from the FracBrain API and providing data to the frontend.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your FracBrain API credentials:
```bash
cp .env.example .env
```

3. Start the server:
```bash
npm start
```

## 24/7 Monitoring

For continuous monitoring of headers, you need to run the monitoring service. This will keep monitoring your headers even when the frontend is not open.

### Running the Monitoring Service

```bash
npm run monitor
```

### Running as a Background Service

For production deployments, it's recommended to run the service with a process manager like PM2:

1. Install PM2 globally:
```bash
npm install -g pm2
```

2. Start the monitoring service with PM2:
```bash
pm2 start npm --name "fracbrain-monitor" -- run monitor
```

3. To ensure the service starts on system boot:
```bash
pm2 startup
pm2 save
```

4. To check the status:
```bash
pm2 status
pm2 logs fracbrain-monitor
```

## API Endpoints

- `GET /monitoring/active-stages` - Get active stages
- `GET /monitoring/monitored-headers` - Get monitored headers
- `GET /monitoring/header-values` - Get monitored header values
- `GET /monitoring/alerts` - Get active alerts
- `POST /monitoring/alerts/:alertId/snooze` - Snooze an alert
- `DELETE /monitoring/alerts/:alertId` - Dismiss an alert

## Development

Run the server with nodemon for development:
```bash
npm run dev
```

## Testing

Run tests:
```bash
npm test
``` 