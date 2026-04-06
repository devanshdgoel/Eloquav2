// app.config.js is the dynamic Expo config.
// It replaces app.json and runs in Node at build/start time, which means it
// can read environment variables. Secrets are loaded from the .env file
// (gitignored) and passed to the app bundle via the `extra` field, which is
// accessible at runtime through expo-constants.

module.exports = {
  expo: {
    name: 'Eloqua',
    slug: 'eloqua',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.eloqua.app',
    },
    android: {
      package: 'com.eloqua.app',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
    },
    web: {
      favicon: './assets/favicon.png',
    },
    scheme: 'eloqua',
    runtimeVersion: {
      policy: 'sdkVersion',
    },
    updates: {
      url: 'https://u.expo.dev/f4bb8d13-0817-4c35-af80-dd6c71b42002',
    },
    extra: {
      eas: {
        projectId: 'f4bb8d13-0817-4c35-af80-dd6c71b42002',
      },
      apiBaseUrl: process.env.API_BASE_URL || 'https://eloqua-backend.onrender.com',

      googleWebClientId:     process.env.GOOGLE_WEB_CLIENT_ID     || '',
      googleIosClientId:     process.env.GOOGLE_IOS_CLIENT_ID     || '',
      googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || '',

      firebaseApiKey:            process.env.FIREBASE_API_KEY            || 'AIzaSyD5ChGuQ3qolrj5oapkSMKEIAvbayTliOY',
      firebaseAuthDomain:        process.env.FIREBASE_AUTH_DOMAIN        || 'eloqua-f714f.firebaseapp.com',
      firebaseProjectId:         process.env.FIREBASE_PROJECT_ID         || 'eloqua-f714f',
      firebaseStorageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || 'eloqua-f714f.firebasestorage.app',
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '301157330813',
      firebaseAppId:             process.env.FIREBASE_APP_ID             || '1:301157330813:web:c68054749712b345aee614',
    },
  },
};
