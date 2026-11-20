# Déploiement : Vercel (site) + Render (API et base)

Coût indicatif sur Render (à vérifier sur render.com/pricing) : API 2 Go de RAM ≈ 25 $/mois + base PostgreSQL ≈ 6 $/mois. Vercel : gratuit (offre Hobby).
Le palier gratuit de Render (512 Mo de RAM) ne suffit pas pour les modèles d'embeddings et le reranker.

## 0. Pré-requis
- Le projet est dans un dépôt **GitHub** (`dokyra-ai`, racine = dossier contenant `backend/`, `frontend/`, `render.yaml`).
- Une clé Groq (`OPENAI_API_KEY`).

## 1. Render : base + API
1. render.com → **New → Blueprint** → choisissez le dépôt. Render lit `render.yaml` et crée la base `dokyra-db` et l'API `dokyra-api`.
2. Renseignez les variables demandées :
   - `OPENAI_API_KEY` : votre clé Groq ;
   - `ADMIN_PASSWORD` : un vrai mot de passe (compte admin créé au premier démarrage) ;
   - `CORS_ORIGINS` : laissez provisoirement `https://exemple.vercel.app`, vous la corrigez à l'étape 3.
3. Attendez la fin du build (plusieurs minutes : les modèles sont téléchargés dans l'image). Vérifiez `https://dokyra-api.onrender.com/health` (l'adresse exacte est affichée sur Render).

## 2. Vercel : le site
1. vercel.com → **Add New → Project** → même dépôt.
2. **Root Directory : `frontend`** (le reste est lu dans `frontend/vercel.json`).
3. **Environment Variables** : `API_URL` = adresse de l'API Render, **sans `/` final** (ex. `https://dokyra-api.onrender.com`).
4. Deploy. Vercel vous donne une adresse `https://xxx.vercel.app`.

## 3. Relier les deux
Dans Render → `dokyra-api` → Environment : `CORS_ORIGINS` = l'adresse Vercel exacte (ex. `https://dokyra-ai.vercel.app`, sans `/` final). Enregistrez : l'API redémarre.
Ouvrez le site, connectez-vous avec `admin` et le mot de passe choisi.

## 4. Données de démonstration (optionnel)
Depuis votre PC, avec l'adresse de l'API :
```bash
cd backend && python -m scripts.seed_demo --url https://dokyra-api.onrender.com --password VOTRE_MOT_DE_PASSE_ADMIN
```
Pour un lien public (CV), créez plutôt un compte employé dédié (page Utilisateurs) que les comptes `demo.*` (`--skip-accounts`), et changez-le si besoin.

## À savoir
- **Rapports PDF** : le disque de Render est éphémère, ils sont perdus à chaque redéploiement/redémarrage. Pour les garder : ajouter un *Disk* monté sur `/app/reports`.
- **Mémoire de l'agent** en RAM : perdue au redémarrage (une validation en attente est alors abandonnée).
- **Mises à jour** : un `git push` redéploie Render et Vercel automatiquement.
- Chaque aperçu de branche Vercel a une autre adresse : elle sera refusée par CORS tant qu'elle n'est pas dans `CORS_ORIGINS` (séparez-les par des virgules).