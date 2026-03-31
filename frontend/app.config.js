// app.config.js is the dynamic Expo config.
// It replaces app.json and runs in Node at build/start time, which means it
// can read environment variables. Secrets are loaded from the .env file
// (gitignored) and passed to the app bundle via the `extra` field, which is
// accessible at runtime through expo-constants.

module.exports = {
  expo: {
    name: 'frontend',
    slug: 'frontend',
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
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
    },
    web: {
      favicon: './assets/favicon.png',
    },
    scheme: 'eloqua',
    extra: {
      // Backend URL — leave blank in development so env.js auto-detects the
      // local machine IP. Set to the production Railway URL for builds.
      apiBaseUrl: process.env.API_BASE_URL || '',

      // Google OAuth client IDs — obtained from Google Cloud Console.
      // See the Google Sign-In setup notes for instructions.
      googleWebClientId:     process.env.GOOGLE_WEB_CLIENT_ID     || '',
      googleIosClientId:     process.env.GOOGLE_IOS_CLIENT_ID     || '',
      googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || '',

      // Firebase project config — all values come from the .env file.
      // Never hardcode these; .env is gitignored.
      firebaseApiKey:            process.env.FIREBASE_API_KEY,
      firebaseAuthDomain:        process.env.FIREBASE_AUTH_DOMAIN,
      firebaseProjectId:         process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket:     process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId:             process.env.FIREBASE_APP_ID,
    },
  },
};
