// Contrat de données partagé avec le backend Python (voir docs/API.md)

export type Role = 'ADMIN' | 'PERSONNEL' | 'ENSEIGNANT' | 'ETUDIANT';
export type Level = 'L1' | 'L2' | 'L3' | 'M1' | 'M2';
export type Track = 'GB' | 'SR' | 'IG';
export type Folder = 'inbox' | 'starred' | 'sent' | 'drafts' | 'archive' | 'trash';
export type Priority = 'NORMALE' | 'HAUTE';
export type RecipientType = 'TO' | 'CC' | 'BCC';

export interface User {
  id: number;
  matricule: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  level?: Level | null;
  track?: Track | null;
  position?: string | null;
  phone?: string | null;
  signature?: string | null;
  notifEmail: boolean;
  /** URL de la photo de profil (null/absent = initiales) */
  avatarUrl?: string | null;
  active: boolean;
  /** Inscription en attente de validation par l'administration */
  pending?: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

/** Demande de création de compte (page /register/:role) */
export interface RegisterPayload {
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  /** Adresse personnelle (≠ e-mail ENI) qui reçoit les codes OTP de vérification et de récupération */
  emailVerification: string;
  phone: string;
  /** Matricule étudiant, identifiant enseignant ou identifiant agent */
  matricule: string;
  password: string;
  // Étudiant
  level?: Level | null;
  track?: Track | null;
  enrollmentYear?: string | null;
  // Enseignant
  teacherStatus?: 'PERMANENT' | 'VACATAIRE' | null;
  specialty?: string | null;
  levelsTaught?: Level[];
  // Personnel / administrateur
  department?: string | null;
  position?: string | null;
  // Administrateur
  justification?: string | null;
  sponsorEmail?: string | null;
}

/** Réponse de POST /auth/register (dict brut côté backend : `is_verified` arrive en snake_case) */
export interface RegisterResponse {
  email: string;
  pending: boolean;
  is_verified?: boolean;
  message?: string;
}

/** Objectif d'un code OTP (voir backend : otp_service) */
export type OtpPurpose = 'REGISTER' | 'PASSWORD_RESET';

export interface OtpResponse {
  success: boolean;
  message: string;
}

export interface VerifyResetOtpResponse extends OtpResponse {
  /** Jeton temporaire à fournir à POST /auth/reset-password (normalisé par AuthService) */
  resetToken: string;
}

export type UserSummary = Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role' | 'avatarUrl'>;

export interface UserPayload {
  matricule: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  level?: Level | null;
  track?: Track | null;
  position?: string | null;
  phone?: string | null;
  active: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Attachment {
  id: number;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface Recipient {
  user: UserSummary;
  type: RecipientType;
}

export interface MailSummary {
  id: number;
  subject: string;
  preview: string;
  from: UserSummary;
  to: UserSummary[];
  date: string;
  read: boolean;
  starred: boolean;
  folder: Folder;
  priority: Priority;
  isAnnouncement: boolean;
  hasAttachments: boolean;
}

export interface MailDetail extends MailSummary {
  body: string;
  recipients: Recipient[];
  groups: { id: number; name: string; type: RecipientType }[];
  attachments: Attachment[];
  parentId?: number | null;
}

export interface ComposePayload {
  subject: string;
  body: string;
  priority: Priority;
  to: number[];
  cc: number[];
  bcc: number[];
  groupIds: number[];
  attachmentIds: number[];
  parentId?: number | null;
  isAnnouncement: boolean;
  draft: boolean;
}

export type FolderCounts = Record<Folder, number>;

export type BulkAction = 'read' | 'unread' | 'archive' | 'trash' | 'delete' | 'restore';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MailGroup {
  id: number;
  name: string;
  address: string;
  description: string;
  type: 'AUTO' | 'MANUELLE';
  criteriaRole?: Role | null;
  criteriaLevel?: Level | null;
  criteriaTrack?: Track | null;
  openToStudents: boolean;
  owner: UserSummary;
  memberCount: number;
  createdAt: string;
  members?: UserSummary[];
}

export interface GroupPayload {
  name: string;
  address: string;
  description: string;
  type: 'AUTO' | 'MANUELLE';
  criteriaRole?: Role | null;
  criteriaLevel?: Level | null;
  criteriaTrack?: Track | null;
  openToStudents: boolean;
  memberIds: number[];
}

export interface MailTemplate {
  id: number;
  title: string;
  category: string;
  subject: string;
  body: string;
  author: UserSummary;
  updatedAt: string;
}

export type TemplatePayload = Pick<MailTemplate, 'title' | 'category' | 'subject' | 'body'>;

/** Corps du POST /users/{userId}/contacts : ajoute un utilisateur à son annuaire personnel */
export interface ContactPayload {
  contactUserId: number;
}

/** Réponse de GET /users/{userId}/contacts/{contactUserId}/exists */
export interface ContactExistsResponse {
  exists: boolean;
}

export interface AdminStats {
  users: { total: number; active: number; byRole: Record<Role, number> };
  messagesSent: number;
  messagesToday: number;
  announcements: number;
  groups: number;
  activity: { date: string; count: number }[];
  topSenders: { user: UserSummary; count: number }[];
}

export interface AuditLog {
  id: number;
  user: UserSummary | null;
  action: string;
  details: string;
  ip: string;
  date: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrateur',
  PERSONNEL: 'Personnel',
  ENSEIGNANT: 'Enseignant',
  ETUDIANT: 'Étudiant',
};

export const LEVELS: Level[] = ['L1', 'L2', 'L3', 'M1', 'M2'];

export const TRACK_LABELS: Record<Track, string> = {
  GB: 'Génie Logiciel et Base de Données',
  SR: 'Administration Systèmes et Réseaux',
  IG: 'Informatique Générale',
};

export const FOLDER_LABELS: Record<Folder, string> = {
  inbox: 'Boîte de réception',
  starred: 'Favoris',
  sent: 'Envoyés',
  drafts: 'Brouillons',
  archive: 'Archives',
  trash: 'Corbeille',
};

/** Hiérarchie des rôles : ADMIN ⊃ PERSONNEL ⊃ ENSEIGNANT ⊃ ETUDIANT */
export const ROLE_RANK: Record<Role, number> = { ETUDIANT: 0, ENSEIGNANT: 1, PERSONNEL: 2, ADMIN: 3 };

export function fullName(u: Pick<User, 'firstName' | 'lastName'> | null | undefined): string {
  return u ? `${u.firstName} ${u.lastName}` : '—';
}
