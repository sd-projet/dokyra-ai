# Dokyra AI — assistant intelligent de gestion documentaire

Une entreprise importe ses documents (PDF, Word, texte). Les employés posent des questions en langage
naturel ; l'IA répond **uniquement** à partir de ces documents, avec les sources et les pages. Un agent
sait en plus comparer deux versions d'une politique, faire des calculs et produire un rapport PDF
(après validation humaine).

## Démo en ligne

**[Ouvrir la démo](https://dokyra-ai.vercel.app/)** — comptes de démonstration affichés sur la page de connexion.

> **Version de démonstration : l'API est simulée dans le navigateur.** Aucun serveur, base de données ni modèle
> d'IA n'est utilisé. Les réponses sont composées par recherche de mots-clés dans deux documents d'exemple
> (politiques de télétravail 2023 et 2025), et les données sont réinitialisées à chaque rechargement. Le
> fonctionnement réel (recherche hybride pgvector, reranking, LLM, agent LangGraph) est celui décrit ci-dessous
> et s'exécute avec `docker compose up` (voir « Démarrage rapide »).

## Démarrage rapide (Docker)

```bash
cp backend/.env.example backend/.env      # renseigner OPENAI_API_KEY (et changer JWT_SECRET / ADMIN_PASSWORD)
docker compose up --build
```

| Service | URL |
|---|---|
| Application (Angular) | http://localhost:4200 |
| API + Swagger | http://localhost:8000/docs |

Connexion initiale : `ADMIN_USER` / `ADMIN_PASSWORD` du `.env` (créé au premier démarrage, rôle admin).
Le premier démarrage télécharge les modèles Hugging Face (embeddings + reranker) : comptez quelques minutes ;
ils sont ensuite conservés dans le volume `models`.

**Données de démonstration** (deux versions d'une politique de télétravail, 2023 et 2025) :

```bash
docker compose exec backend python -m scripts.seed_demo --password VOTRE_MOT_DE_PASSE_ADMIN
```

Puis essayez, dans le chat : « Quelles sont les conditions pour obtenir trois jours de télétravail par
semaine ? », et dans l'onglet Agent : « Compare les conditions de télétravail de nos deux dernières
politiques et génère un rapport ».

### Démo publique temporaire (sans serveur ni domaine)

```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d --build
docker compose logs tunnel | grep trycloudflare      # affiche l'adresse https://xxxx.trycloudflare.com
```

L'adresse change à chaque redémarrage du tunnel et n'est pas garantie : c'est fait pour montrer le projet,
pas pour la production. Avant de partager le lien : mettez `APP_ENV=production` et de vrais `JWT_SECRET` /
`ADMIN_PASSWORD` dans `backend/.env`, et supprimez (page Utilisateurs) ou changez les comptes `demo.*` si vous
ne voulez pas que n'importe qui consomme votre quota LLM. Arrêt : `docker compose -f docker-compose.yml -f docker-compose.demo.yml down`.

### Développement sans Docker

```bash
# Base : le compose ne publie pas le port de PostgreSQL. Pour y accéder depuis votre machine, ajoutez
#        au service « db » :  ports: ["127.0.0.1:5433:5432"]  puis, dans backend/.env, utilisez
#        DATABASE_URL=postgresql+psycopg://dokyra:dokyra@localhost:5433/dokyra
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.presentation.main:app --reload

cd frontend && npm install && npm start       # http://localhost:4200, /api est proxifié vers :8000
```

Tests : `cd backend && pytest`.

## Architecture

```
backend/app/
  domain/          entités, règles métier, ports (interfaces), calculatrice sûre, tarifs   (aucune dépendance technique)
  application/     cas d'usage : ingestion, question, comparaison, conversations, auth, suivi des coûts…
  infrastructure/  PostgreSQL+pgvector, LangChain/OpenAI, Hugging Face, LangGraph, PDF, JWT
  presentation/    API FastAPI (routers), schémas, composition root (container.py)
frontend/          Angular 19 (standalone, signals) : chat, documents, agent, modèles, usage, utilisateurs
```

Le domaine et l'application ne dépendent que de **ports** : un test vérifie qu'ils n'importent ni FastAPI,
ni SQLAlchemy, ni LangChain. Changer de fournisseur LLM = changer `OPENAI_BASE_URL` / `LLM_MODEL`
(Mistral, Groq, Ollama, vLLM… tout ce qui parle le protocole OpenAI).

## Les trois blocs du cahier des charges

**Bloc A — LLM**
- Rôles system / user / assistant, historique de conversation, prompt système anti-injection (les extraits sont des *données*).
- Sortie **JSON structurée** (`structured: true` : points clés, niveau de confiance, « trouvé / non trouvé »).
- **Streaming** SSE (`/chat/stream`) : métadonnées, sources, tokens, puis événement final.
- Tokens, latence et **coût estimé** de chaque appel, enregistrés et visibles dans l'onglet « Usage ».
- **Comparaison de modèles** (`/llm/compare`) : mêmes passages, plusieurs modèles, qualité / latence / prix côte à côte.

**Bloc B — RAG**
1. Import PDF, DOCX, TXT, MD (taille limitée, doublons détectés par SHA-256, aucun import « à moitié » en cas d'erreur).
2. Extraction : pages réelles pour les PDF ; tableaux inclus et pages approchées (sauts de page) pour les DOCX.
3. Chunking récursif (800 caractères, recouvrement 120).
4. Embeddings Hugging Face multilingues (384 dimensions).
5. Stockage PostgreSQL + **pgvector** (index HNSW cosinus).
6. **Recherche hybride** : vectorielle + plein texte français, fusionnées par RRF.
7. **Reranking** par cross-encoder multilingue (désactivable : `USE_RERANKER=false`).
8. Génération avec les passages retenus ; question de suivi **reformulée** à partir de l'historique.
9. **Citations** `[n]` : le serveur indique lesquelles sont réellement citées ; sources et pages affichées.

**Bloc C — Agent** (LangGraph, mémoire d'état par session)
Outils : lister les documents, retrouver les versions d'un document, recherche documentaire, comparaison
de deux documents, résumé, calcul (évaluateur arithmétique sûr, pas d'`eval`), date du jour, rapport PDF.
La génération du PDF **met l'agent en pause** : l'utilisateur voit un aperçu et autorise ou refuse.
Les étapes de l'agent (outils appelés, arguments, résultats) sont renvoyées et affichées.

## Fonctionnalités ajoutées

Comptes et rôles (admin : import/suppression de documents, gestion des utilisateurs ; utilisateur : questions) ·
mots de passe PBKDF2 · limitation des tentatives de connexion · conversations persistées par utilisateur ·
feedback 👍/👎 sur les réponses · comparaison directe de documents avec export PDF · résumé de document ·
suivi des coûts · refus de démarrer en production avec des secrets par défaut (`APP_ENV=production`) ·
`/health` · scripts `seed_demo` et `eval_retrieval` (mesure du recall de la recherche sur vos propres questions).

## API (extrait — tout est détaillé dans Swagger)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/auth/login` | connexion, renvoie le jeton JWT |
| POST / GET / DELETE | `/documents`, `/documents/{id}` | import (admin), liste, suppression (admin) |
| POST | `/documents/compare` | comparaison de deux documents (ou des 2 dernières versions d'un titre) |
| POST | `/chat/ask`, `/chat/stream` | question (réponse complète ou streaming SSE) |
| GET / DELETE | `/conversations`, `/conversations/{id}` | historique |
| POST | `/agent/run`, `/agent/resume` | agent ; `resume` valide ou refuse l'action en attente |
| POST | `/llm/compare` | même question sur plusieurs modèles |
| GET | `/usage`, `/reports/{nom}` | tokens et coûts ; téléchargement d'un rapport PDF |

## Limites connues

- **OCR non géré** : un PDF scanné (sans texte) est refusé avec un message explicite.
- **Pages DOCX approchées** (Word ne stocke pas la pagination) ; les PDF ont les vraies pages.
- **Mémoire de l'agent en RAM** (`MemorySaver`) : perdue au redémarrage et non partagée entre plusieurs
  workers. Pour la production : `langgraph-checkpoint-postgres`.
- **Rapports PDF partagés** entre utilisateurs authentifiés (pas de cloisonnement par utilisateur).
- **Pas de droits par document** : tout utilisateur connecté peut interroger tous les documents.
- **Schéma créé par `create_all`** : pour faire évoluer la base en production, introduire Alembic.
- **Tarifs des modèles indicatifs** (`app/domain/pricing.py`) : ils changent ; surchargez-les via `MODEL_PRICES`.
- Si vous changez de modèle d'embeddings, ajustez `EMBEDDING_DIM` **et** réimportez les documents (nouvelle base).
- `pgvector` < 0.8 : la recherche filtrée sur un seul document peut renvoyer moins de passages (un avertissement est journalisé). Le `docker-compose.yml` utilise `pgvector/pgvector:pg16` ; vérifiez la version de pgvector de l'image que vous obtenez.
- **Démo en ligne simulée** : la version publiée sur Vercel n'appelle pas de backend (réponses par mots-clés, données en mémoire, PDF/DOCX importés non lus). Voir `DEPLOIEMENT.md`.