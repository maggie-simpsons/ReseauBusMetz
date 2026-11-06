import * as Location from 'expo-location';

export async function getPosition() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Autorisation de localisation refusée.');
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: p.coords.latitude, lon: p.coords.longitude };
  } catch {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { lat: last.coords.latitude, lon: last.coords.longitude };
    throw new Error('Impossible d’obtenir votre position.');
  }
}
