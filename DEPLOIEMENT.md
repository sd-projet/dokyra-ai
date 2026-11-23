# Guide de déploiement — Dokyra AI

Ce document décrit deux modes de mise en ligne :

| Mode | Contenu | Usage recommandé |
|---|---|---|
| **A. Vitrine de démonstration** | Frontend seul sur Vercel, API simulée dans le navigateur | Présentation du projet (CV, portfolio), sans infrastructure serveur |
| **B. Déploiement complet** | Frontend sur Vercel, API FastAPI et base PostgreSQL sur Render | Application fonctionnelle avec IA, documents persistants et authentification réelle |

---

## Prérequis communs

- Un dépôt **GitHub** contenant le projet. La racine du dépôt est le dossier qui regroupe `backend/`, `frontend/` et `render.yaml`.
- Un compte [Vercel](https://vercel.com).
- Pour le mode B uniquement : un compte [Render](https://render.com) et une clé d'API Groq (`OPENAI_API_KEY`).

---

## A. Vitrine de démonstration (Vercel uniquement)

Seul le frontend est publié. Les appels à l'API sont interceptés et traités dans le navigateur par un moteur de démonstration : aucun serveur, base de données ni modèle d'IA n'est requis.

### Procédure

1. Dans Vercel, choisissez **Add New → Project** et importez le dépôt.
2. Définissez **Root Directory** sur `frontend`. Le reste de la configuration est lu dans `frontend/vercel.json`.
3. Ne définissez **pas** la variable d'environnement `API_URL`. En son absence, le script `scripts/write-config.mjs` active automatiquement le mode démonstration au moment du build.
4. Lancez le déploiement. Vercel fournit une adresse stable de la forme `https://<projet>.vercel.app`.

### Fonctionnalités disponibles

- Questions sur les documents d'exemple (deux versions d'une politique de télétravail), avec sources, pages et citations.
- Agent : comparaison de versions, calculs, validation humaine avant la génération d'un rapport PDF téléchargeable.
- Comparaison de deux documents, suivi d'usage, gestion des utilisateurs avec le compte administrateur.
- Comptes de démonstration : ceux affichés sur la page de connexion.

### Limites

- Les réponses sont composées par recherche de mots-clés dans les documents d'exemple ; elles ne sont pas produites par un modèle de langage.
- Les données sont conservées en mémoire et réinitialisées à chaque rechargement de la page.
- Seuls les fichiers `.txt` et `.md` importés sont interrogeables ; les PDF et DOCX sont listés mais leur contenu n'est pas lu.
- Un encadré « Mode démo » est affiché dans l'application pour le signaler aux visiteurs.

Il est recommandé de préciser sur le CV qu'il s'agit d'une version de démonstration et d'indiquer le lien du dépôt GitHub.

---

## B. Déploiement complet (Vercel + Render)

### Architecture

```
Navigateur ──► Vercel (frontend Angular, fichiers statiques)
                  │  appels HTTPS vers API_URL
                  ▼
              Render : service web « dokyra-api » (FastAPI, Docker)
                  │
                  ▼
              Render : base PostgreSQL « dokyra-db » (extension pgvector)
```

Le service API charge des modèles d'embeddings et un reranker : prévoyez une instance disposant d'au moins **2 Go de RAM**. Une instance de 512 Mo provoque une erreur « Out of memory » au démarrage. Les modèles sont téléchargés pendant la construction de l'image Docker, ce qui évite tout téléchargement au démarrage.

### Étape 1 — Render : base de données et API

**Option recommandée : Blueprint.** Dans Render, choisissez **New → Blueprint**, sélectionnez le dépôt : Render lit `render.yaml` et crée la base `dokyra-db` ainsi que le service `dokyra-api`.

**Option manuelle** (si l'entrée Blueprint n'est pas disponible) :

1. **New → Postgres** : nom `dokyra-db`, base `dokyra`, utilisateur `dokyra`, dans la région de votre choix. Copiez ensuite l'**Internal Database URL**.
2. **New → Web Service** avec le dépôt, puis :
   - Runtime : **Docker** ;
   - Root Directory : `backend` ;
   - Dockerfile Path : `./Dockerfile` ;
   - Région : identique à celle de la base ;
   - Instance : au moins 2 Go de RAM ;
   - Health Check Path : `/health`.
3. Renseignez les variables d'environnement :

| Variable | Valeur |
|---|---|
| `PORT` | `8000` |
| `APP_ENV` | `production` |
| `DATABASE_URL` | Internal Database URL de la base |
| `JWT_SECRET` | chaîne aléatoire longue (voir ci-dessous) |
| `ADMIN_USER` | `admin` |
| `ADMIN_PASSWORD` | mot de passe robuste du compte administrateur |
| `OPENAI_API_KEY` | clé d'API Groq |
| `OPENAI_BASE_URL` | `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | `openai/gpt-oss-20b` |
| `AVAILABLE_MODELS` | `openai/gpt-oss-20b,openai/gpt-oss-120b` |
| `MODEL_PRICES` | `{"openai/gpt-oss-20b":[0.075,0.30],"openai/gpt-oss-120b":[0.15,0.60]}` |
| `CORS_ORIGINS` | adresse du site Vercel (renseignée à l'étape 3) |

Génération d'un secret :

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Avec `APP_ENV=production`, l'API refuse de démarrer si `JWT_SECRET` ou `ADMIN_PASSWORD` conservent une valeur par défaut. C'est volontaire.

Une fois le déploiement terminé, vérifiez que `https://<votre-api>.onrender.com/health` répond.

### Étape 2 — Vercel : frontend

1. **Add New → Project**, même dépôt.
2. **Root Directory** : `frontend`.
3. **Environment Variables** : `API_URL` = adresse de l'API Render, **sans `/` final** (par exemple `https://dokyra-api.onrender.com`).
4. Lancez le déploiement et notez l'adresse `https://<projet>.vercel.app`.

Dès que `API_URL` est défini, le mode démonstration est désactivé et le site utilise l'API réelle.

### Étape 3 — Autoriser le frontend (CORS)

Dans Render, ouvrez le service `dokyra-api`, rubrique **Environment**, et définissez `CORS_ORIGINS` sur l'adresse exacte du site Vercel (sans `/` final). Plusieurs origines peuvent être séparées par des virgules. Enregistrez : l'API redémarre automatiquement.

Connectez-vous ensuite avec `admin` et le mot de passe défini dans `ADMIN_PASSWORD`.

### Étape 4 — Données de démonstration (facultatif)

Depuis un poste disposant du projet :

```bash
cd backend
python -m scripts.seed_demo --url https://<votre-api>.onrender.com --password <MOT_DE_PASSE_ADMIN>
```

Pour un site public, préférez créer un compte employé dédié depuis la page **Utilisateurs** et utilisez l'option `--skip-accounts`, afin de ne pas exposer les comptes `demo.*`.

---

## Exploitation

- **Mises à jour** : chaque `git push` sur la branche principale redéploie automatiquement Vercel et Render.
- **Aperçus de branche Vercel** : chaque aperçu possède sa propre adresse, refusée par CORS tant qu'elle n'est pas ajoutée à `CORS_ORIGINS`.
- **Rapports PDF** : le disque d'un service Render est éphémère ; les rapports sont perdus à chaque redémarrage ou redéploiement. Pour les conserver, associez un disque persistant monté sur `/app/reports`.
- **Mémoire de l'agent** : conservée en RAM, elle est perdue au redémarrage ; une validation en attente est alors abandonnée.
- **Quota du fournisseur LLM** : toute personne disposant d'un compte consomme votre quota. Limitez la diffusion des identifiants.

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| `Configuration non sécurisée : ADMIN_PASSWORD est « admin » (ou vide)` | Variable absente, vide ou non enregistrée | Définir `ADMIN_PASSWORD` dans Render, enregistrer, attendre le redéploiement |
| `Out of memory (used over 512Mi)` | Instance trop petite pour les modèles | Choisir une instance de 2 Go de RAM ou plus |
| `No open ports detected` suivi d'un démarrage | Chargement des modèles en cours | Attendre ; vérifier que `PORT=8000` est défini |
| Erreur CORS dans la console du navigateur | `CORS_ORIGINS` différent de l'adresse du site | Renseigner l'adresse exacte, sans `/` final |
| Le site Vercel affiche « Mode démo » alors que l'API est déployée | `API_URL` non défini au moment du build | Définir `API_URL`, puis redéployer le frontend |
| Erreur de connexion à la base | `DATABASE_URL` incorrecte ou région différente | Utiliser l'Internal Database URL, dans la même région que l'API |