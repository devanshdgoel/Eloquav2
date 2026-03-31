import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

/**
 * In Expo Go, Constants.expoConfig.hostUri is "192.168.x.x:8081" —
 * the IP of the dev machine running Metro. We swap the port to 8000
 * so the app can reach the FastAPI backend on the same machine,
 * regardless of which device (simulator or physical) is running.
 * In production, set the "extra.apiBaseUrl" field in app.json.
 */
function getApiBaseUrl() {
  if (extra.apiBaseUrl) return extra.apiBaseUrl;
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:8000`;
  }
  return 'http://localhost:8000';
}

export const API_BASE_URL = getApiBaseUrl();

export const GOOGLE_WEB_CLIENT_ID =
  extra.googleWebClientId || 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

export const GOOGLE_IOS_CLIENT_ID =
  extra.googleIosClientId || 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com';

export const GOOGLE_ANDROID_CLIENT_ID =
  extra.googleAndroidClientId || 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com';
