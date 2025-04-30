import React, { useState, useEffect } from 'react';
import { Container, Card, Form, Button, Alert, Spinner, Row, Col, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_CONFIG, getAuthHeaders } from '../config';

// Component for displaying and editing any JSON settings object
const JsonEditor = ({ value, onChange, disabled }) => {
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState(null);

  // Update the text area when the value changes
  useEffect(() => {
    setJsonText(JSON.stringify(value, null, 2));
  }, [value]);

  // Handle changes to the text area
  const handleChange = (e) => {
    const text = e.target.value;
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setError(null);
      onChange(parsed);
    } catch (err) {
      setError('Invalid JSON: ' + err.message);
    }
  };

  return (
    <div>
      <Form.Control
        as="textarea"
        rows={10}
        value={jsonText}
        onChange={handleChange}
        disabled={disabled}
        className={error ? 'is-invalid' : ''}
      />
      {error && <div className="invalid-feedback">{error}</div>}
    </div>
  );
};

const AdvancedSettings = () => {
  const [settings, setSettings] = useState(null);
  const [headerThresholds, setHeaderThresholds] = useState(null);
  const [globalSettings, setGlobalSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  // Fetch all settings on component mount
  useEffect(() => {
    fetchAllSettings();
  }, []);
  
  const fetchAllSettings = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [settingsResponse, thresholdsResponse, globalSettingsResponse] = await Promise.all([
        axios.get(`${API_CONFIG.baseUrl}/api/settings`, {
          headers: getAuthHeaders()
        }),
        axios.get(`${API_CONFIG.baseUrl}/api/settings/header-thresholds`, {
          headers: getAuthHeaders()
        }),
        axios.get(`${API_CONFIG.baseUrl}/api/settings/global`, {
          headers: getAuthHeaders()
        })
      ]);
      
      setSettings(settingsResponse.data);
      setHeaderThresholds(thresholdsResponse.data);
      setGlobalSettings(globalSettingsResponse.data);
      console.log("All settings loaded:", {
        settings: settingsResponse.data,
        headerThresholds: thresholdsResponse.data,
        globalSettings: globalSettingsResponse.data
      });
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError('Failed to load settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const saveSettings = async (settingsType, data) => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    
    let endpoint;
    let payload;
    
    switch (settingsType) {
      case 'general':
        endpoint = '/api/settings';
        payload = data;
        break;
      case 'thresholds':
        endpoint = '/api/settings/header-thresholds';
        payload = data;
        break;
      case 'global':
        endpoint = '/api/settings/global';
        payload = { settings: data };
        break;
      default:
        setError('Unknown settings type');
        setSaving(false);
        return;
    }
    
    try {
      await axios.post(`${API_CONFIG.baseUrl}${endpoint}`, payload, {
        headers: getAuthHeaders()
      });
      
      setSuccess(`${settingsType} settings saved successfully`);
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(`Error saving ${settingsType} settings:`, err);
      setError(`Failed to save ${settingsType} settings. Please try again.`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container className="mt-4 text-center">
        <Spinner animation="border" />
        <p>Loading all settings...</p>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <Row className="mb-4">
        <Col>
          <h1>Advanced Settings</h1>
          <p className="text-muted">
            View and edit all system settings
          </p>
        </Col>
        <Col xs="auto">
          <Button as={Link} to="/" variant="outline-primary">
            Back to Dashboard
          </Button>
        </Col>
      </Row>
      
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}
      
      <Row>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">Pattern Settings</h5>
            </Card.Header>
            <Card.Body>
              <JsonEditor 
                value={settings} 
                onChange={setSettings}
                disabled={saving}
              />
              <div className="d-flex justify-content-end mt-3">
                <Button 
                  variant="primary" 
                  onClick={() => saveSettings('general', settings)}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Pattern Settings'}
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
        
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">Header Thresholds</h5>
            </Card.Header>
            <Card.Body>
              <JsonEditor 
                value={headerThresholds} 
                onChange={setHeaderThresholds}
                disabled={saving}
              />
              <div className="d-flex justify-content-end mt-3">
                <Button 
                  variant="primary" 
                  onClick={() => saveSettings('thresholds', headerThresholds)}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Header Thresholds'}
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      
      <Row>
        <Col>
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">Global Settings</h5>
            </Card.Header>
            <Card.Body>
              <JsonEditor 
                value={globalSettings} 
                onChange={setGlobalSettings}
                disabled={saving}
              />
              <div className="d-flex justify-content-end mt-3">
                <Button 
                  variant="primary" 
                  onClick={() => saveSettings('global', globalSettings)}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Global Settings'}
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default AdvancedSettings; 