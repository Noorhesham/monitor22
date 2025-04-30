import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Container, Card, Form, Button, Alert, Spinner, Row, Col } from 'react-bootstrap';
import { API_CONFIG, getAuthHeaders } from '../config';
import { Link } from 'react-router-dom';

const GlobalSettingsEditor = () => {
  const [settings, setSettings] = useState({
    pollingInterval: 30,
    lowPressureThreshold: 50,
    criticalPressureThreshold: 30,
    lowBatteryThreshold: 30,
    criticalBatteryThreshold: 15,
    emailNotifications: {
      enabled: false,
      sendOnLow: false,
      sendOnCritical: true,
      recipients: []
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  // Fetch settings on component mount
  useEffect(() => {
    fetchSettings();
  }, []);
  
  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_CONFIG.baseUrl}/api/settings`, {
        headers: getAuthHeaders()
      });
      
      if (response.data) {
        // Ensure email notifications object has all required fields
        const emailNotifications = {
          enabled: false,
          sendOnLow: false,
          sendOnCritical: true,
          recipients: [],
          ...response.data.emailNotifications
        };
        
        setSettings({
          ...response.data,
          emailNotifications
        });
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setError(err.response?.data?.message || 'Failed to load settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Handle nested properties for email notifications
    if (name.startsWith('email.')) {
      const emailField = name.split('.')[1];
      setSettings(prev => ({
        ...prev,
        emailNotifications: {
          ...prev.emailNotifications,
          [emailField]: type === 'checkbox' ? checked : value
        }
      }));
    } else {
      // Handle top-level properties, converting to numbers where appropriate
      const newValue = ['pollingInterval', 'lowPressureThreshold', 'criticalPressureThreshold', 
                        'lowBatteryThreshold', 'criticalBatteryThreshold'].includes(name)
                      ? Number(value)
                      : value;
      
      setSettings(prev => ({
        ...prev,
        [name]: newValue
      }));
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    
    try {
      const response = await axios.post(
        `${API_CONFIG.baseUrl}/api/settings/global`,
        { settings },
        { headers: getAuthHeaders() }
      );
      
      if (response.data.success) {
        setSuccess(true);
        setSettings(response.data.settings);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        throw new Error(response.data.error || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      setError(err.response?.data?.message || 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  
  const handleEmailRecipientChange = (e, index) => {
    setSettings(prev => {
      const updatedRecipients = [...prev.emailNotifications.recipients];
      updatedRecipients[index] = e.target.value;
      
      return {
        ...prev,
        emailNotifications: {
          ...prev.emailNotifications,
          recipients: updatedRecipients
        }
      };
    });
  };
  
  const addEmailRecipient = () => {
    setSettings(prev => ({
      ...prev,
      emailNotifications: {
        ...prev.emailNotifications,
        recipients: [...prev.emailNotifications.recipients, '']
      }
    }));
  };
  
  const removeEmailRecipient = (index) => {
    setSettings(prev => {
      const updatedRecipients = [...prev.emailNotifications.recipients];
      updatedRecipients.splice(index, 1);
      
      return {
        ...prev,
        emailNotifications: {
          ...prev.emailNotifications,
          recipients: updatedRecipients
        }
      };
    });
  };
  
  if (loading) {
    return (
      <Container className="mt-4 text-center">
        <Spinner animation="border" />
        <p>Loading settings...</p>
      </Container>
    );
  }
  
  if (!settings) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          Settings could not be loaded. <Button variant="link" onClick={fetchSettings}>Try again</Button>
        </Alert>
      </Container>
    );
  }
  
  return (
    <Container className="mt-4">
      <Row className="mb-4">
        <Col>
          <h2>Global System Settings</h2>
        </Col>
        <Col xs="auto">
          <Button as={Link} to="/advanced-settings" variant="outline-secondary">
            Advanced Settings
          </Button>
          <Button as={Link} to="/" variant="outline-primary" className="ms-2">
            Back to Dashboard
          </Button>
        </Col>
      </Row>
      
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">Settings saved successfully!</Alert>}
      
      <Card className="mb-4">
        <Card.Body>
          <Form data-testid="settings-form" onSubmit={handleSubmit}>
            <h4>System Thresholds</h4>
            
            <Form.Group className="mb-3">
              <Form.Label>Polling Interval (seconds)</Form.Label>
              <Form.Control
                data-testid="polling-interval-input"
                type="number"
                name="pollingInterval"
                value={settings.pollingInterval}
                onChange={handleChange}
                min="10"
                required
              />
              <Form.Text className="text-muted">
                How often the system checks for updates (minimum 10 seconds)
              </Form.Text>
            </Form.Group>
            
            <Row className="mb-3">
              <Col>
                <Form.Group>
                  <Form.Label>Low Pressure Threshold (PSI)</Form.Label>
                  <Form.Control
                    type="number"
                    name="lowPressureThreshold"
                    value={settings.lowPressureThreshold}
                    onChange={handleChange}
                    required
                  />
                </Form.Group>
              </Col>
              <Col>
                <Form.Group>
                  <Form.Label>Critical Pressure Threshold (PSI)</Form.Label>
                  <Form.Control
                    type="number"
                    name="criticalPressureThreshold"
                    value={settings.criticalPressureThreshold}
                    onChange={handleChange}
                    required
                  />
                </Form.Group>
              </Col>
            </Row>
            
            <Row className="mb-3">
              <Col>
                <Form.Group>
                  <Form.Label>Low Battery Threshold (%)</Form.Label>
                  <Form.Control
                    type="number"
                    name="lowBatteryThreshold"
                    value={settings.lowBatteryThreshold}
                    onChange={handleChange}
                    min="0"
                    max="100"
                    required
                  />
                </Form.Group>
              </Col>
              <Col>
                <Form.Group>
                  <Form.Label>Critical Battery Threshold (%)</Form.Label>
                  <Form.Control
                    type="number"
                    name="criticalBatteryThreshold"
                    value={settings.criticalBatteryThreshold}
                    onChange={handleChange}
                    min="0"
                    max="100"
                    required
                  />
                </Form.Group>
              </Col>
            </Row>
            
            <h4 className="mt-4">Email Notifications</h4>
            
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                name="email.enabled"
                label="Enable Email Notifications"
                checked={settings.emailNotifications.enabled}
                onChange={handleChange}
              />
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                name="email.sendOnLow"
                label="Send on Low Thresholds"
                checked={settings.emailNotifications.sendOnLow}
                onChange={handleChange}
                disabled={!settings.emailNotifications.enabled}
              />
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                name="email.sendOnCritical"
                label="Send on Critical Thresholds"
                checked={settings.emailNotifications.sendOnCritical}
                onChange={handleChange}
                disabled={!settings.emailNotifications.enabled}
              />
            </Form.Group>
            
            {settings.emailNotifications.enabled && (
              <div className="mb-3">
                <Form.Label>Email Recipients</Form.Label>
                {settings.emailNotifications.recipients.map((recipient, index) => (
                  <Row key={index} className="mb-2">
                    <Col>
                      <Form.Control
                        type="email"
                        value={recipient}
                        onChange={(e) => handleEmailRecipientChange(e, index)}
                        placeholder="email@example.com"
                      />
                    </Col>
                    <Col xs="auto">
                      <Button variant="danger" onClick={() => removeEmailRecipient(index)}>
                        Remove
                      </Button>
                    </Col>
                  </Row>
                ))}
                
                <Button 
                  variant="outline-primary" 
                  onClick={addEmailRecipient} 
                  className="mt-2"
                >
                  Add Recipient
                </Button>
              </div>
            )}
            
            <div className="d-grid gap-2 d-md-flex justify-content-md-end mt-4">
              <Button variant="secondary" onClick={fetchSettings} className="me-md-2" disabled={saving}>
                Reset
              </Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                    <span className="ms-2">Saving...</span>
                  </>
                ) : 'Save Settings'}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default GlobalSettingsEditor; 