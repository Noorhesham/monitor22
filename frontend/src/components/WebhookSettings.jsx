import React, { useState, useEffect } from 'react';
import { API_CONFIG } from '../config.js';
import { Bell, Plus, Trash, Save } from 'lucide-react';

export default function WebhookSettings() {
  const [webhookConfig, setWebhookConfig] = useState({
    enabled: false,
    urls: [],
    interval: 60000,
    lastSent: null
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [newUrl, setNewUrl] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Fetch current webhook configuration
  useEffect(() => {
    const fetchWebhookConfig = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`${API_CONFIG.baseUrl}/api/webhooks/config`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch webhook config: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        setWebhookConfig(data);
      } catch (err) {
        console.error('Error fetching webhook configuration:', err);
        setError('Failed to load webhook configuration. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchWebhookConfig();
  }, []);
  
  // Save webhook configuration
  const saveWebhookConfig = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/webhooks/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: webhookConfig.enabled,
          urls: webhookConfig.urls,
          interval: webhookConfig.interval
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save webhook config: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data.success) {
        setSuccess(true);
        setWebhookConfig(data.config);
        setTimeout(() => setSuccess(false), 3000); // Clear success message after 3 seconds
      } else {
        throw new Error('Failed to save webhook configuration');
      }
    } catch (err) {
      console.error('Error saving webhook configuration:', err);
      setError('Failed to save webhook configuration. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Add new webhook URL
  const addWebhookUrl = () => {
    if (!newUrl || !newUrl.trim()) return;
    
    try {
      // Basic URL validation
      new URL(newUrl); // Will throw if invalid
      
      // Check for duplicates
      if (webhookConfig.urls.includes(newUrl)) {
        setError('This webhook URL already exists');
        return;
      }
      
      // Add URL
      setWebhookConfig(prev => ({
        ...prev,
        urls: [...prev.urls, newUrl.trim()]
      }));
      
      // Clear input
      setNewUrl('');
      setError(null);
    } catch (err) {
      setError('Invalid URL format');
    }
  };
  
  // Remove webhook URL
  const removeWebhookUrl = (url) => {
    setWebhookConfig(prev => ({
      ...prev,
      urls: prev.urls.filter(u => u !== url)
    }));
  };
  
  // Update interval
  const handleIntervalChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 5000) {
      setWebhookConfig(prev => ({
        ...prev,
        interval: value
      }));
    }
  };
  
  // Toggle enabled state
  const toggleEnabled = () => {
    setWebhookConfig(prev => ({
      ...prev,
      enabled: !prev.enabled
    }));
  };
  
  if (isLoading) {
    return <div className="p-4 text-center">Loading webhook settings...</div>;
  }
  
  return (
    <div className="bg-white p-4 rounded-md shadow-sm">
      <h3 className="text-lg font-semibold flex items-center mb-4">
        <Bell className="mr-2 h-5 w-5 text-blue-500" />
        Webhook Notifications
      </h3>
      
      {error && (
        <div className="mb-4 p-2 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-2 bg-green-100 text-green-700 rounded-md">
          Webhook settings saved successfully!
        </div>
      )}
      
      <div className="mb-4">
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={webhookConfig.enabled}
            onChange={toggleEnabled}
            className="mr-2 h-4 w-4"
          />
          <span>Enable webhook notifications</span>
        </label>
        <p className="text-sm text-gray-500 mt-1">
          When enabled, alerts will be sent to the configured webhook URLs.
        </p>
      </div>
      
      <div className="mb-4">
        <label className="block mb-1 font-medium">Minimum Interval (ms)</label>
        <input
          type="number"
          value={webhookConfig.interval}
          onChange={handleIntervalChange}
          min="5000"
          step="1000"
          className="w-full p-2 border rounded-md"
          disabled={!webhookConfig.enabled}
        />
        <p className="text-sm text-gray-500 mt-1">
          Minimum time between webhook notifications (to prevent flooding). Minimum 5000ms (5 seconds).
        </p>
      </div>
      
      <div className="mb-4">
        <label className="block mb-1 font-medium">Webhook URLs</label>
        
        <div className="space-y-2 mb-2">
          {webhookConfig.urls.length === 0 ? (
            <p className="text-sm text-gray-500">No webhook URLs configured.</p>
          ) : (
            webhookConfig.urls.map((url, index) => (
              <div key={index} className="flex items-center">
                <input
                  type="text"
                  value={url}
                  readOnly
                  className="flex-1 p-2 border rounded-l-md bg-gray-50"
                />
                <button
                  type="button"
                  onClick={() => removeWebhookUrl(url)}
                  className="p-2 bg-red-500 text-white rounded-r-md hover:bg-red-600"
                  disabled={!webhookConfig.enabled}
                >
                  <Trash className="h-5 w-5" />
                </button>
              </div>
            ))
          )}
        </div>
        
        <div className="flex mb-2">
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://example.com/webhook"
            className="flex-1 p-2 border rounded-l-md"
            disabled={!webhookConfig.enabled}
          />
          <button
            type="button"
            onClick={addWebhookUrl}
            className="p-2 bg-blue-500 text-white rounded-r-md hover:bg-blue-600"
            disabled={!webhookConfig.enabled || !newUrl}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        
        <p className="text-sm text-gray-500">
          Add endpoints that will receive alert notifications.
        </p>
      </div>
      
      {webhookConfig.lastSent && (
        <div className="mb-4 text-sm text-gray-500">
          Last notification sent: {new Date(webhookConfig.lastSent).toLocaleString()}
        </div>
      )}
      
      <button
        type="button"
        onClick={saveWebhookConfig}
        disabled={isSaving}
        className="w-full flex items-center justify-center p-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300"
      >
        {isSaving ? (
          'Saving...'
        ) : (
          <>
            <Save className="mr-2 h-5 w-5" />
            Save Webhook Settings
          </>
        )}
      </button>
    </div>
  );
} 