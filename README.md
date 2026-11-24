# ENI Mail — Messagerie interne

Application web de messagerie interne de l'**École Nationale d'Informatique (ENI)**.
Elle permet aux étudiants, enseignants et services administratifs d'échanger des messages, de gérer des listes de diffusion et de publier des annonces officielles.

Projet généré avec [Angular CLI](https://github.com/angular/angular-cli) version 20.3.42.

## Fonctionnalités

- **Messagerie** : boîte de réception, envoi, brouillons, favoris, corbeille, recherche, pièces jointes.
- **Annuaire** de toute l'école.
- **Listes de diffusion** : automatiques (par rôle, niveau, parcours) ou manuelles.
- **Modèles d'annonces** officielles (réservé au personnel).
- **Profil** : informations personnelles, signature, mot de passe.
- **Administration** (réservée aux administrateurs) : tableau de bord, gestion des utilisateurs, journal d'audit.
- **Création de compte** et réinitialisation du mot de passe.

### Rôles

| Rôle | Accès principal |
| --- | --- |
| `ETUDIANT` | Messagerie, annuaire, listes de diffusion |
| `ENSEIGNANT` | + création de listes manuelles |
| `PERSONNEL` | + modèles d'annonces |
| `ADMIN` | + administration complète |

## Prérequis

- [Node.js](https://nodejs.org/) (version compatible avec Angular 20)
- npm
- Pour le mode API réelle : le backend (API Python / FastAPI) démarré sur `http://localhost:8000`

## Installation

```bash
npm install
```

Placez ensuite le logo de l'école dans `public/logo.png` : il sert d'icône de l'application (favicon), de logo dans la barre supérieure et sur les pages de connexion.

## Lancer l'application

Il y a deux modes de développement.

### 1. Avec l'API réelle

```bash
npm start
```

Les appels `/api` sont redirigés vers `http://localhost:8000` par `proxy.conf.json`. Le backend doit donc être démarré.

### 2. Sans backend (backend simulé)

```bash
npm run start:mock
```

Le backend est alors simulé dans le navigateur (`src/app/core/mock`). Aucune API ni base de données n'est nécessaire, et les données sont réinitialisées à chaque rechargement.

Dans les deux cas, ouvrez ensuite `http://localhost:4200/`. L'application se recharge automatiquement à chaque modification des fichiers sources.

## Comptes de démonstration

Ces comptes existent **uniquement avec le backend simulé** (`npm run start:mock`). Ils sont définis dans [`src/app/core/mock/demo-users.json`](src/app/core/mock/demo-users.json).

| Rôle | E-mail | Mot de passe |
| --- | --- | --- |
| Administrateur | `admin@eni.mg` | `Admin@2026` |
| Personnel (Scolarité) | `scolarite@eni.mg` | `Eni@2026` |
| Enseignant | `jean.rakotomalala@eni.mg` | `Eni@2026` |
| Étudiant (L3) | `toky.rabe@eni.mg` | `Eni@2026` |

Le fichier contient 14 utilisateurs au total. Pour en ajouter ou en modifier, éditez ce fichier JSON.

> Il n'existe plus de page de sélection de rôle en un clic : il faut se connecter avec une adresse e-mail et un mot de passe.

## Structure du projet

```
public/                  Fichiers statiques (logo.png)
src/
├── environments/        Configuration par mode (développement, mock, production)
└── app/
    ├── core/
    │   ├── guards/        Gardes de routes (authentification, rôles)
    │   ├── interceptors/  Intercepteurs HTTP (jeton, erreurs)
    │   ├── mock/          Backend simulé et demo-users.json
    │   ├── models/        Modèles de données
    │   └── services/      Services (auth, courriers, groupes, etc.)
    ├── features/          Pages : auth, mail, directory, groups, templates, profile, admin
    ├── layout/            Structure de l'application (barre supérieure, menu latéral)
    └── shared/            Composants et pipes réutilisables
```

## Compilation

```bash
ng build
```

Les fichiers compilés sont placés dans le dossier `dist/`. La compilation de production utilise `src/environments/environment.ts` et se connecte à l'API réelle.

> **Attention** : le code du backend simulé et les comptes de démonstration (`demo-users.json`) sont encore inclus dans le bundle de production, même s'ils ne sont pas utilisés quand `useMockApi` vaut `false`. N'y mettez jamais de vrais mots de passe ni de vraies données.

## Tests

```bash
ng test
```

Les tests unitaires s'exécutent avec [Karma](https://karma-runner.github.io).

## Génération de code

```bash
ng generate component nom-du-composant
```

La liste complète des schémas disponibles s'obtient avec `ng generate --help`.

## Ressources

- [Angular CLI — documentation et commandes](https://angular.dev/tools/cli)