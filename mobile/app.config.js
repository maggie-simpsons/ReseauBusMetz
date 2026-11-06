// Complète app.json : la clé Google Maps (nécessaire uniquement pour les builds
// Android/iOS hors Expo Go) est lue dans la variable d'environnement GOOGLE_MAPS_API_KEY.
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return config;
  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      ['react-native-maps', { androidGoogleMapsApiKey: key, iosGoogleMapsApiKey: key }],
    ],
  };
};
