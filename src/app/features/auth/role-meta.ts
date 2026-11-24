import { Role } from '../../core/models';
import { IconName } from '../../shared/icon.component';

/** Présentation de chaque rôle (icône, teinte, textes) pour l'inscription */
export interface RoleMeta {
  role: Role;
  slug: 'etudiant' | 'enseignant' | 'personnel' | 'administrateur';
  icon: IconName;
  tone: 'sky' | 'teal' | 'amber' | 'violet';
  label: string;
  registerHint: string;
}

export const ROLE_META: RoleMeta[] = [
  {
    role: 'ETUDIANT', slug: 'etudiant', icon: 'user', tone: 'sky', label: 'Étudiant',
    registerHint: "Pour les étudiants inscrits à l'ENI.",
  },
  {
    role: 'ENSEIGNANT', slug: 'enseignant', icon: 'pen', tone: 'teal', label: 'Enseignant',
    registerHint: 'Pour les enseignants permanents ou vacataires.',
  },
  {
    role: 'PERSONNEL', slug: 'personnel', icon: 'book', tone: 'amber', label: 'Personnel',
    registerHint: "Pour les services administratifs de l'école.",
  },
  {
    role: 'ADMIN', slug: 'administrateur', icon: 'shield', tone: 'violet', label: 'Administrateur',
    registerHint: 'Accès soumis à une validation renforcée.',
  },
];

export const roleBySlug = (slug: string | null | undefined): RoleMeta | undefined =>
  ROLE_META.find((r) => r.slug === slug);
