# Mots en Cascade — V2

Jeu de réflexion hors ligne : regrouper 24 mots en 6 familles, avec validation
automatique dès le quatrième mot sélectionné. Le corpus embarqué contient 500
niveaux générés de façon déterministe, répartis sur 25 chapitres.

## Compatibilité Android

- `applicationId` conservé : `com.vincentcosti.motsencascade`
- `versionName` : `2.0.0`
- `versionCode` : `2`
- aucune publicité, aucun compte, aucun service analytics et aucun achat intégré
- corpus, progression, pièces et préférences disponibles sans réseau

## Développement

```bash
npm install
npm run lint
npm test
npm run corpus:report
npm run build
npm run android:sync
```

Le script `corpus:report` contrôle les quantités, doublons normalisés, niveaux
identiques, fréquence des mots/familles, distances de réutilisation et la
répartition de difficulté. Les paramètres de récompense sont centralisés dans
`src/game/economy.ts`.

## Signature Android

Le fichier Gradle accepte les propriétés `MOTS_KEYSTORE_PATH`,
`MOTS_KEYSTORE_PASSWORD`, `MOTS_KEY_ALIAS` et `MOTS_KEY_PASSWORD`. La clé de
publication historique doit être fournie au moment du build release afin de
préserver la compatibilité de mise à jour Google Play.
