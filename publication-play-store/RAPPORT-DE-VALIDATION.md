# Rapport de validation — Mots en Cascade V2

## Périmètre réalisé

- moteur de sélection avec validation automatique au quatrième mot ;
- six familles et 24 mots par niveau ;
- 500 niveaux déterministes, 25 chapitres, rotation de familles et cooldown de
  20 niveaux sur groupes et mots lorsque le corpus le permet ;
- courbe de difficulté en vagues (`decouverte`, `rythme`, `maitrise`, `expert`,
  `sommet`) ;
- feedback correct/incorrect, shake, haptique optionnel, animations de réussite,
  écran de victoire et passage visuel au niveau suivant ;
- portefeuille de pièces, aides Duo/Étiquette/Résoudre, récompenses de séries
  et de paliers, protection contre les doubles récompenses et replay limité aux
  améliorations de record ;
- migration défensive des sauvegardes V1, persistance locale et mode hors ligne ;
- réglages son, haptique, mouvement réduit et réinitialisation explicite ;
- validateur automatisé du corpus et tests Vitest.

## Vérifications JavaScript

| Commande | Résultat |
|---|---|
| `npm run lint` | PASS |
| `npm test -- --reporter=dot` | PASS — 9 tests |
| `npm run smoke:ui` | PASS — écran d’accueil rendu sous JSDOM |
| `npm run corpus:report` | PASS — 500 niveaux, 0 problème |
| `npm run build` | PASS — bundle web Vite généré |
| serveur Vite + contrôle HTTP de la page et du module principal | PASS |

## Corpus observé

Les valeurs ci-dessous sont produites par `npm run corpus:report` et doivent
être recopiées ici après toute régénération du corpus :

- 500 niveaux ; 6 familles / niveau ; 24 mots / niveau ;
- 403 familles/variantes effectivement utilisées ;
- 1 181 mots normalisés ;
- distance minimale observée : 21 niveaux pour une famille ou un mot ;
- niveaux strictement identiques : 0 ;
- erreurs de structure : 0.

## Android / Play Console

Le projet Capacitor est généré avec l’`applicationId` historique et le
`versionCode` incrémenté. La compilation native release et la vérification de
signature doivent être exécutées dans un environnement disposant du SDK Android,
de Gradle et de la clé de publication historique. Tant que ces éléments ne sont
pas accessibles, aucun AAB signé ne doit être déclaré comme prêt à importer.
