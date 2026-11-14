/**
 * Comptes de démonstration affichés sur la page de connexion.
 *
 * - Ces comptes sont créés par `python -m scripts.seed_demo` (gardez les identifiants identiques
 *   dans backend/scripts/seed_demo.py).
 * - Pour désactiver l'encart (production), laissez simplement la liste vide : `DEMO_ACCOUNTS = []`.
 * - Ne mettez JAMAIS ici le compte administrateur réel (celui du fichier .env) : ce fichier est lisible
 *   par toute personne qui ouvre le site.
 */
export interface DemoAccount {
  label: string;
  description: string;
  username: string;
  password: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: 'Employé',
    description: 'Pose des questions aux documents et utilise l\'agent.',
    username: 'demo.employe',
    password: 'DemoEmploye2025',
  },
  {
    label: 'Administrateur',
    description: 'Importe et supprime des documents, gère les utilisateurs.',
    username: 'demo.admin',
    password: 'DemoAdmin2025',
  },
];