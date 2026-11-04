# Metz Transport

Carte interactive du réseau de transport en commun de Metz (**LE MET'**) : lignes, arrêts, horaires, bus en temps réel, perturbations, calcul d'itinéraire et vélos en libre-service **GraouLib'**.

- **Frontend** : React + Vite + Leaflet (`client/`)
- **Backend** : Node.js + Express (`server/`)

## Fonctionnalités

| Onglet / couche | Ce que ça fait |
|---|---|
| **Lignes** | Toutes les lignes par catégorie (Mettis, Lianes, Citéis, Proxis, Navettes, Flexo, Scolaires), tracé sur la carte, liste des arrêts par sens, nombre de bus en circulation |
| **Arrêts** | Recherche d'arrêt, arrêts autour de moi (géolocalisation), prochains passages avec retards en temps réel (rafraîchis toutes les 20 s) |
| **Itinéraire** | Départ/arrivée par arrêt, adresse, position GPS ou clic sur la carte ; départ maintenant ou à une date/heure ; plusieurs propositions avec correspondances et marche |
| **Infos trafic** | Perturbations en cours et à venir |
| **Bus en direct** | Position de tous les bus, actualisée toutes les 10 s, avec direction, prochain arrêt et retard |
| **Vélos GraouLib'** | Stations, vélos disponibles et places libres |

## Données utilisées (open data)

| Données | Source |
|---|---|
| Horaires théoriques (GTFS) | https://data.lemet.fr/documents/LEMET-gtfs.zip |
| Temps réel (GTFS-RT : véhicules, retards, alertes) | proxy de transport.data.gouv.fr |
| Vélos (GBFS) | https://gbfs.graoulib.fifteen.eu/gbfs/metz/gbfs.json |
| Recherche d'adresses | Géoplateforme IGN (`data.geopf.fr/geocodage`) |
| Fond de carte | OpenStreetMap |

Le fichier GTFS est téléchargé au démarrage du serveur dans `server/data/`, puis mis à jour automatiquement toutes les 24 h.

## Installation

Prérequis : Node.js 20 ou plus récent.

```bash
npm run install:all
```

## Lancer en développement

```bash
npm run dev
```

- Application : http://localhost:5173
- API : http://localhost:3001/api

## Lancer en production

```bash
npm run build   # compile l'application React dans client/dist
npm start       # le serveur Node sert l'API et l'application sur http://localhost:3001
```

Variables d'environnement facultatives : `PORT`, `GTFS_URL`, `RT_VEHICLES_URL`, `RT_TRIPS_URL`, `RT_ALERTS_URL`, `GBFS_URL`.

## API

| Route | Description |
|---|---|
| `GET /api/meta` | Exploitant, période de validité des horaires |
| `GET /api/routes` | Toutes les lignes avec leurs tracés |
| `GET /api/routes/:id` | Détail d'une ligne : arrêts par sens |
| `GET /api/stations` | Tous les arrêts |
| `GET /api/stations/:id/departures` | Prochains passages (théoriques et temps réel) |
| `GET /api/trips/:id` | Parcours d'une course avec les retards |
| `GET /api/vehicles` | Positions des bus en temps réel |
| `GET /api/alerts` | Perturbations |
| `GET /api/bikes` | Stations GraouLib' |
| `GET /api/plan?from=lat,lon&to=lat,lon[&date=AAAA-MM-JJ&time=HH:MM]` | Calcul d'itinéraire |
| `GET /api/geocode?q=...` | Recherche d'adresses |

## Organisation du code

```
server/src/
  index.js     routes de l'API Express
  gtfs.js      téléchargement, lecture et indexation du GTFS
  realtime.js  décodage des flux GTFS-RT, calcul des retards
  planner.js   calcul d'itinéraire (Connection Scan Algorithm)
  bikes.js     flux GBFS GraouLib'
  time.js      gestion de l'heure de Paris
  geo.js       distances et temps de marche
client/src/
  App.jsx      mise en page, onglets, état global
  components/  carte, panneaux Lignes/Arrêts/Itinéraire/Infos trafic
```

## Limites connues

- Le calcul d'itinéraire cherche l'**arrivée la plus tôt** : il peut proposer une correspondance de plus qu'un trajet un peu plus long. L'option « arriver avant… » n'est pas encore disponible.
- La marche est estimée à vol d'oiseau (avec un facteur de détour), sans suivre les rues.
- Les horaires ne couvrent que la période publiée par LE MET' (environ un mois glissant).
