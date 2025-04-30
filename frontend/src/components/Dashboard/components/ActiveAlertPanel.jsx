import React from 'react';
import { Bell, AlertCircle, Clock, X, BarChart2 } from 'lucide-react';
import { useSettings } from '../../../contexts/SettingsContext.jsx';
import { format } from 'date-fns';
import { SNOOZE_DURATIONS } from '../constants';

export default function ActiveAlertPanel({ alerts, onDismiss }) {
  const { snoozeAlert, isAlertSnoozed } = useSettings();
  
  // Filter out snoozed alerts
  const activeAlerts = alerts.filter(alert => !isAlertSnoozed(alert.id));
  
  // Don't render if no active alerts
  if (activeAlerts.length === 0) {
    return (
      <div className="bg-white shadow-md rounded-lg border border-gray-200 overflow-hidden sticky top-4">
        <div className="bg-gray-50 p-3 flex items-center justify-between border-b border-gray-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="text-gray-400 w-5 h-5" />
            <h2 className="font-semibold text-lg text-gray-400">Active Alerts (0)</h2>
          </div>
        </div>
        <div className="p-4 text-center text-gray-500">
          No active alerts
        </div>
      </div>
    );
  }
  
  // Group alerts by job/stage
  const alertsByStage = activeAlerts.reduce((acc, alert) => {
    // Use "unknown" as the default stageId if not present
    const stageId = alert.stageId || "unknown";
    if (!acc[stageId]) acc[stageId] = [];
    acc[stageId].push(alert);
    return acc;
  }, {});
  
  return (
    <div className="bg-white shadow-md rounded-lg border border-gray-200 overflow-hidden sticky top-4">
      <div className="bg-red-600 p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="text-white w-5 h-5" />
          <h2 className="font-semibold text-lg text-white">Active Alerts ({activeAlerts.length})</h2>
        </div>
      </div>
      
      <div className="divide-y divide-gray-200">
        {Object.keys(alertsByStage).map(stageId => (
          <div key={stageId} className="p-4">
            {stageId !== "unknown" && (
              <h3 className="font-medium text-gray-700 mb-2">Stage {stageId}</h3>
            )}
            {alertsByStage[stageId].map(alert => (
              <AlertCard 
                key={alert.id} 
                alert={alert} 
                onDismiss={() => onDismiss(alert.id)}
                onSnooze={(duration) => snoozeAlert(alert.id, duration)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertCard({ alert, onDismiss, onSnooze }) {
  const [showSnoozeOptions, setShowSnoozeOptions] = React.useState(false);
  
  // Format the timestamp
  const formattedTime = alert.timestamp 
    ? format(new Date(alert.timestamp), 'MMM d, h:mm a') 
    : '';
  
  let alertTitle = '';
  let alertContent = '';
  let alertColor = '';
  
  switch (alert.type) {
    case 'threshold':
      alertTitle = 'Threshold Alert';
      alertContent = `${alert.headerName} is at ${alert.value} (below threshold ${alert.threshold})`;
      alertColor = 'red';
      break;
    case 'frozen':
      alertTitle = 'Frozen Data Alert';
      alertContent = `${alert.headerName} has not changed for ${Math.floor((alert.timestamp - alert.lastChangeTime)/1000)} seconds`;
      alertColor = 'yellow';
      break;
    case 'error':
      alertTitle = 'Error Alert';
      alertContent = `Error with ${alert.headerName}: ${alert.message}`;
      alertColor = 'gray';
      break;
    default:
      alertTitle = 'Alert';
      alertContent = `Issue with ${alert.headerName}`;
      alertColor = 'gray';
  }
  
  return (
    <div className={`mb-3 p-3 rounded-md border ${
      alertColor === 'red' ? 'bg-red-50 border-red-200' : 
      alertColor === 'yellow' ? 'bg-yellow-50 border-yellow-200' : 
      'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
              alertColor === 'red' ? 'bg-red-100 text-red-800' : 
              alertColor === 'yellow' ? 'bg-yellow-100 text-yellow-800' : 
              'bg-gray-100 text-gray-800'
            }`}>
              {alertTitle}
            </span>
            <span className="text-gray-500 text-xs">{formattedTime}</span>
          </div>
          <p className="mt-1 text-sm text-gray-800">{alertContent}</p>
        </div>
        
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setShowSnoozeOptions(!showSnoozeOptions)}
            className="text-gray-500 hover:text-gray-700 p-1.5 rounded hover:bg-gray-100 w-8 h-8 flex items-center justify-center"
            title="Snooze alert"
          >
            <Clock className="w-4 h-4 flex-shrink-0" />
          </button>
          <button
            onClick={onDismiss}
            className="text-gray-500 hover:text-gray-700 p-1.5 rounded hover:bg-gray-100 w-8 h-8 flex items-center justify-center"
            title="Dismiss alert"
          >
            <X className="w-4 h-4 flex-shrink-0" />
          </button>
        </div>
      </div>
      
      {showSnoozeOptions && (
        <div className="mt-2 p-2 bg-white rounded-md border border-gray-200 shadow-sm">
          <div className="text-xs font-medium text-gray-600 mb-1">Snooze for:</div>
          <div className="flex flex-wrap gap-1">
            {SNOOZE_DURATIONS.map(duration => (
              <button
                key={duration.value}
                onClick={() => {
                  onSnooze(duration.value);
                  setShowSnoozeOptions(false);
                }}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-2 py-1 rounded"
              >
                {duration.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 