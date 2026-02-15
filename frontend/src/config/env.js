import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const API_BASE_URL = extra.apiBaseUrl || 'http://localhost:8000';

export const GOOGLE_WEB_CLIENT_ID =
  extra.googleWebClientId || 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

export const GOOGLE_IOS_CLIENT_ID =
  extra.googleIosClientId || 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com';

export const GOOGLE_ANDROID_CLIENT_ID =
  extra.googleAndroidClientId || 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com';
