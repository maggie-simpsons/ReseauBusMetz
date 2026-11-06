# Metz Transport — application mobile

Application React Native (Expo SDK 58 + Expo Router) qui utilise **le même backend** que la version web (`../server`).

## Écrans

| Onglet | Contenu |
|---|---|
| **Carte** | Réseau complet, bus en direct (10 s), arrêts (au zoom), vélos GraouLib’, couches activables. Appui long : « Partir d’ici / Aller ici ». |
| **Lignes** | Lignes par catégorie → détail : arrêts par sens, bus en circulation, perturbations, « Voir sur la carte » |
| **Arrêts** | Recherche, arrêts autour de moi (GPS) → prochains passages temps réel (20 s), filtre par ligne |
| **Itinéraire** | Départ/arrivée par arrêt, adresse, GPS ou point sur la carte ; maintenant ou plus tard ; détail des trajets |
| **Infos trafic** | Perturbations en cours et à venir (badge sur l’onglet) |

## Lancer en développement

```bash
# 1. Le backend (depuis la racine du projet)
npm run dev --prefix server        # API sur le port 3001

# 2. L'application
cd mobile
npm install
npx expo start                      # puis scanner le QR code avec Expo Go, ou « a » pour l'émulateur Android
```

En développement, l'app appelle automatiquement `http://<IP de votre PC>:3001/api` (la machine qui sert le bundle Expo).
Le téléphone et le PC doivent être sur le même réseau Wi-Fi.

## Adresse du backend

Pour pointer vers un autre serveur (production, tunnel…), définir la variable :

```bash
EXPO_PUBLIC_API_URL=https://transport.example.fr npx expo start
```

(sans `/api` à la fin). En production, utilisez HTTPS : Android et iOS bloquent le HTTP en clair dans les builds de release.

## Builds (APK / App Store)

Expo Go suffit pour développer. Pour une vraie application installable :

```bash
GOOGLE_MAPS_API_KEY=xxx EXPO_PUBLIC_API_URL=https://... npx eas-cli@latest build -p android
```

La clé Google Maps (Maps SDK for Android / iOS) est nécessaire hors Expo Go ; elle est injectée par `app.config.js`.

## Organisation

```
src/app/            écrans (Expo Router : chaque fichier = une route)
  (tabs)/           onglets : index (carte), lines, stops, plan, alerts
  route/[id].jsx    détail d'une ligne
  station/[id].jsx  prochains passages à un arrêt
src/components/     composants partagés (badges, alertes, saisie de lieu)
src/lib/            api (fetch + rafraîchissement), données partagées, format, géo, thème
```
