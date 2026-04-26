const mapsKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ||
  process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
  '';

module.exports = () => ({
  name: 'WithU',
  slug: 'withu-expo-go',
  version: '1.0.5',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'withu',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.withu.platform.app',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription:
        'WithU behöver kameraåtkomst för att du ska kunna ta och skicka bilder i chatten.',
      NSMicrophoneUsageDescription:
        'WithU behöver mikrofonåtkomst för röstmeddelanden och framtida samtal.',
      NSPhotoLibraryUsageDescription:
        'WithU behöver bildåtkomst för att du ska kunna skicka bilder i chatten.',
      NSLocationWhenInUseUsageDescription:
        'WithU behöver platsåtkomst för att visa personer nära dig inom 1 till 5 kilometer.',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#1B2B4B',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: 'com.withu.app',
    softwareKeyboardLayoutMode: 'resize',
    permissions: [
      'android.permission.CAMERA',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
    ],
    ...(mapsKey
      ? {
          config: {
            googleMaps: {
              apiKey: mapsKey,
            },
          },
        }
      : {}),
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#1B2B4B',
        dark: {
          backgroundColor: '#1B2B4B',
        },
      },
    ],
  ],
  extra: {
    router: {},
    eas: {
      projectId: 'b5e116b3-b3cd-4be6-9ef0-47bec69862ec',
    },
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  updates: {
    enabled: false,
  },
});
