import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mfcr7788.lingji',
  appName: '灵集',
  webDir: 'capacitor-preview',
  server: {
    // Vercel 生产部署 URL
    url: 'https://ai.zjsifan.com',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0A1629',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0A1629',
      overlaysWebView: false,
    },
  },
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0A1629',
    webContentsDebuggingEnabled: false,
  },
};

export default config;
