import { API_ENDPOINTS } from '../constants/app';

interface MentorData {
  name: string;
  style: string;
  description: string;
}

interface MentorsResponse {
  [key: string]: MentorData;
}

/**
 * Fetches available mentors from the API
 */
export const fetchMentors = async (): Promise<MentorsResponse> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(`${API_ENDPOINTS.baseUrl}${API_ENDPOINTS.mentors}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch mentors: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching mentors:', error);
    
    // Return local fallback data if API call fails
    return {
      marcus: {
        name: 'Marcus Aurelius',
        style: 'calm',
        description: 'Roman Emperor and Stoic philosopher',
      },
      seneca: {
        name: 'Seneca',
        style: 'motivational',
        description: 'Roman Stoic philosopher and statesman',
      },
      epictetus: {
        name: 'Epictetus',
        style: 'firm',
        description: 'Former slave turned influential Stoic philosopher',
      },
    };
  }
};

/**
 * Checks if the API is available
 */
export const checkApiHealth = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    const response = await fetch(`${API_ENDPOINTS.baseUrl}${API_ENDPOINTS.health}`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    console.error('API health check failed:', error);
    return false;
  }
}; 