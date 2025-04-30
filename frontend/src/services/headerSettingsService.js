import { API_CONFIG } from '@config';

class HeaderSettingsService {
  static async getHeaderValue(projectId, headerId) {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/headers/${headerId}/value`);
      if (!response.ok) {
        throw new Error(`Failed to fetch header value: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching header value:', error);
      return null;
    }
  }

  static async updateProjectHeaderSettings(projectId, settings) {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/settings/project/${projectId}/headers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });
      if (!response.ok) {
        throw new Error(`Failed to update header settings: ${response.status}`);
      }
      return true;
    } catch (error) {
      console.error('Error updating header settings:', error);
      return false;
    }
  }

  static async getProjectHeaderSettings(projectId) {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/settings/project/${projectId}/headers`);
      if (!response.ok) {
        throw new Error(`Failed to fetch header settings: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching header settings:', error);
      return null;
    }
  }
}

export { HeaderSettingsService }; 