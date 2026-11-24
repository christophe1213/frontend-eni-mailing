// Jeu de données de démonstration — cohérent avec docs/database/seed.sql
import demoUsers from './demo-users.json';
import { Attachment, Folder, Level, MailTemplate, Priority, RecipientType, Role, Track, User } from '../models';

export interface DbUser extends User {
  password: string;
  /** Inscription en ligne : e-mail personnel qui reçoit les codes OTP */
  emailVerification?: string | null;
  /** `false` tant que le code OTP d'inscription n'a pas été validé (absent = compte historique, considéré vérifié) */
  emailVerified?: boolean;
}

export interface DbMessage {
  id: number;
  fromId: number;
  subject: string;
  body: string;
  priority: Priority;
  isAnnouncement: boolean;
  parentId: number | null;
  createdAt: string;
  sentAt: string | null;
  recipients: { userId: number; type: RecipientType }[];
  groupTargets: { groupId: number; type: RecipientType }[];
  attachments: Attachment[];
}

/** État d'un message pour un utilisateur (table `boite`) */
export interface DbBox {
  id: number;
  messageId: number;
  userId: number;
  type: 'FROM' | RecipientType;
  folder: Exclude<Folder, 'starred'>;
  read: boolean;
  starred: boolean;
}

export interface DbGroup {
  id: number;
  name: string;
  address: string;
  description: string;
  type: 'AUTO' | 'MANUELLE';
  criteriaRole: Role | null;
  criteriaLevel: Level | null;
  criteriaTrack: Track | null;
  openToStudents: boolean;
  ownerId: number;
  memberIds: number[];
  createdAt: string;
}

export interface DbTemplate extends Omit<MailTemplate, 'author'> {
  authorId: number;
}

export interface DbLog {
  id: number;
  userId: number | null;
  action: string;
  details: string;
  ip: string;
  date: string;
}

/** Annuaire personnel : `userId` a ajouté `contactUserId` à son carnet */
export interface DbContact {
  id: number;
  userId: number;
  contactUserId: number;
}

export interface MockDb {
  users: DbUser[];
  messages: DbMessage[];
  boxes: DbBox[];
  groups: DbGroup[];
  templates: DbTemplate[];
  logs: DbLog[];
  /** Absent des bases déjà enregistrées dans le localStorage : créé à la demande */
  contacts?: DbContact[];
  seq: number;
}

const ago = (days: number, hours = 0): string =>
  new Date(Date.now() - (days * 24 + hours) * 3_600_000).toISOString();

/** Mots de passe de démonstration (voir README) */
export const DEMO_PASSWORD = 'Eni@2026';

/** Utilisateurs de démonstration : voir demo-users.json (backend simulé uniquement) */
function seedUsers(): DbUser[] {
  return (demoUsers as unknown as Omit<DbUser, 'createdAt' | 'lastLoginAt'>[]).map((x) => ({
    ...x, createdAt: ago(300), lastLoginAt: ago(1),
  }));
}

function seedGroups(): DbGroup[] {
  const g = (id: number, name: string, address: string, description: string, type: 'AUTO' | 'MANUELLE',
    crit: [Role | null, Level | null, Track | null], openToStudents: boolean, ownerId: number, memberIds: number[] = []): DbGroup => ({
    id, name, address, description, type, criteriaRole: crit[0], criteriaLevel: crit[1], criteriaTrack: crit[2],
    openToStudents, ownerId, memberIds, createdAt: ago(200 - id),
  });
  return [
    g(1, 'Tous les étudiants', 'etudiants@eni.mg', 'Tous les étudiants inscrits', 'AUTO', ['ETUDIANT', null, null], false, 1),
    g(2, 'Tous les enseignants', 'enseignants@eni.mg', 'Corps enseignant', 'AUTO', ['ENSEIGNANT', null, null], false, 1),
    g(3, 'L3 – Génie Logiciel', 'l3-gb@eni.mg', 'Promotion L3 parcours GB', 'AUTO', ['ETUDIANT', 'L3', 'GB'], true, 2),
    g(4, 'L3 – tous parcours', 'l3@eni.mg', 'Promotion L3', 'AUTO', ['ETUDIANT', 'L3', null], true, 2),
    g(5, 'Club Dev ENI', 'club-dev@eni.mg', 'Club de développement – projets et hackathons', 'MANUELLE', [null, null, null], true, 6, [6, 7, 8, 11, 12]),
    g(6, 'Personnel administratif', 'personnel@eni.mg', 'Services administratifs', 'AUTO', ['PERSONNEL', null, null], false, 1),
    g(7, 'L2 – Génie Logiciel', 'l2-gb@eni.mg', 'Promotion L2 parcours GB', 'AUTO', ['ETUDIANT', 'L2', 'GB'], true, 2),
  ];
}

function seedTemplates(): DbTemplate[] {
  return [
    {
      id: 1, title: 'Convocation examen', category: 'Examens', authorId: 2, updatedAt: ago(20),
      subject: 'Convocation aux examens {{session}} – {{niveau}}',
      body: 'Bonjour,\n\nLes examens de la session {{session}} pour le niveau {{niveau}} débuteront le {{date}}.\nLe planning détaillé est joint à ce message.\n\nLa Scolarité',
    },
    {
      id: 2, title: 'Réunion pédagogique', category: 'Réunions', authorId: 3, updatedAt: ago(12),
      subject: 'Réunion pédagogique du {{date}}',
      body: 'Chers collègues,\n\nUne réunion pédagogique se tiendra le {{date}} à {{heure}} en {{salle}}.\nOrdre du jour : {{ordre_du_jour}}\n\nLa Direction des études',
    },
    {
      id: 3, title: 'Absence enseignant', category: 'Informations', authorId: 2, updatedAt: ago(5),
      subject: 'Absence – {{matiere}} du {{date}}',
      body: 'Bonjour à tous,\n\nLe cours de {{matiere}} prévu le {{date}} est annulé. Il sera rattrapé ultérieurement.\n\nCordialement',
    },
    {
      id: 4, title: 'Rappel de dossier incomplet', category: 'Administratif', authorId: 2, updatedAt: ago(3),
      subject: 'Dossier incomplet – {{piece}} à fournir avant le {{date}}',
      body: 'Bonjour,\n\nVotre dossier administratif est incomplet : il manque {{piece}}.\nMerci de le déposer au service de la Scolarité avant le {{date}}.\n\nService de la Scolarité — ENI',
    },
  ];
}

interface SeedMail {
  from: number;
  to: number[];
  cc?: number[];
  groups?: number[];
  subject: string;
  body: string;
  days: number;
  hours?: number;
  priority?: Priority;
  announcement?: boolean;
  attachments?: Omit<Attachment, 'id'>[];
  draft?: boolean;
}

const SEED_MAILS: SeedMail[] = [
  {
    from: 2, to: [], groups: [4], days: 0, hours: 2, priority: 'HAUTE', announcement: true,
    subject: 'Convocation aux examens du premier semestre – L3',
    body: 'Bonjour,\n\nLes examens du premier semestre pour le niveau L3 débuteront le lundi 16 novembre 2026 à 8h00.\nLe planning détaillé par parcours est joint à ce message.\n\nMerci de vous présenter 15 minutes avant le début de chaque épreuve muni(e) de votre carte d\'étudiant.\n\nService de la Scolarité — ENI',
    attachments: [{ fileName: 'planning-examens-L3-S1.pdf', mimeType: 'application/pdf', size: 248_000 }],
  },
  {
    from: 4, to: [], groups: [3], days: 1, hours: 3,
    subject: 'TP Base de données – rendu du projet',
    body: 'Bonjour à tous,\n\nLe projet de base de données (modélisation + scripts SQL) est à rendre au plus tard le vendredi 13 novembre.\nFormat : une archive .zip contenant le MCD, le MLD et les scripts.\n\nBon courage,\nJ. Rakotomalala',
    attachments: [
      { fileName: 'sujet-projet-bdd.pdf', mimeType: 'application/pdf', size: 132_500 },
      { fileName: 'consignes.txt', mimeType: 'text/plain', size: 640 },
    ],
  },
  {
    from: 7, to: [4], days: 0, hours: 5,
    subject: 'Question sur le projet BDD',
    body: 'Bonjour Monsieur,\n\nEst-il possible de travailler en binôme pour le projet de base de données ?\n\nCordialement,\nToky Rabe – L3 GB',
  },
  {
    from: 3, to: [], groups: [2], days: 2, priority: 'HAUTE', announcement: true,
    subject: 'Réunion pédagogique du 6 novembre',
    body: 'Chers collègues,\n\nUne réunion pédagogique se tiendra le jeudi 6 novembre à 14h00 en salle du conseil.\nOrdre du jour : bilan de mi-semestre, organisation des examens, questions diverses.\n\nLa Direction des études',
  },
  {
    from: 6, to: [], groups: [5], days: 3,
    subject: 'Hackathon ENI 2026 – inscriptions ouvertes',
    body: 'Salut la team !\n\nLes inscriptions au hackathon ENI 2026 sont ouvertes jusqu\'au 20 novembre. Thème : « Numérique et éducation à Madagascar ».\nÉquipes de 3 à 4 personnes.\n\nÀ vos claviers !\nTiana',
  },
  {
    from: 8, to: [7], days: 0, hours: 1,
    subject: 'Binôme pour le projet ?',
    body: 'Salut Toky,\n\nTu as déjà un binôme pour le projet BDD ? Si non, on peut le faire ensemble.\n\nNomena',
  },
  {
    from: 5, to: [], groups: [4], days: 4,
    subject: 'Cours de réseaux – changement de salle',
    body: 'Bonjour,\n\nÀ partir de cette semaine, le cours d\'administration réseaux aura lieu en salle 12 (bâtiment B).\n\nM. Razafindrabe',
  },
  {
    from: 1, to: [2, 3], days: 6,
    subject: 'Mise en service de la messagerie interne ENI',
    body: 'Bonjour,\n\nLa nouvelle plateforme de messagerie interne est désormais disponible. Les listes de diffusion par niveau et parcours sont créées automatiquement.\n\nN\'hésitez pas à me remonter vos remarques.\n\nH. Randrianarisoa – Administrateur',
  },
  {
    from: 2, to: [], groups: [1], days: 8, announcement: true,
    subject: 'Rappel : paiement des droits d\'inscription',
    body: 'Bonjour,\n\nNous rappelons à tous les étudiants que la date limite de paiement des droits d\'inscription est fixée au 30 novembre 2026.\n\nService de la Scolarité — ENI',
  },
  {
    from: 4, to: [2], cc: [3], days: 1,
    subject: 'Notes du contrôle continu – L3 GB',
    body: 'Bonjour Madame,\n\nVous trouverez ci-joint les notes du contrôle continu de base de données pour la promotion L3 GB.\n\nCordialement,\nJ. Rakotomalala',
    attachments: [{ fileName: 'notes-cc-bdd-l3gb.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 18_400 }],
  },
  {
    from: 7, to: [8], days: 0,
    subject: 'Re: Binôme pour le projet ?',
    body: 'Oui avec plaisir ! On se voit demain à la bibliothèque pour commencer le MCD ?\n\nToky',
  },
  {
    from: 7, to: [6], days: 0, draft: true,
    subject: 'Inscription hackathon',
    body: 'Bonjour Monsieur,\n\nJe souhaiterais inscrire notre équipe au hackathon…',
  },
];

function membersOf(group: DbGroup, users: DbUser[]): number[] {
  if (group.type === 'MANUELLE') return group.memberIds;
  return users
    .filter((x) => x.active
      && (!group.criteriaRole || x.role === group.criteriaRole)
      && (!group.criteriaLevel || x.level === group.criteriaLevel)
      && (!group.criteriaTrack || x.track === group.criteriaTrack))
    .map((x) => x.id);
}

export function resolveGroupMembers(group: DbGroup, users: DbUser[]): number[] {
  return membersOf(group, users);
}

export function createSeedDb(): MockDb {
  const users = seedUsers();
  const groups = seedGroups();
  const db: MockDb = { users, groups, templates: seedTemplates(), messages: [], boxes: [], logs: [], seq: 1000 };
  let attId = 1;

  SEED_MAILS.forEach((m, i) => {
    const date = ago(m.days, m.hours ?? 0);
    const msg: DbMessage = {
      id: i + 1, fromId: m.from, subject: m.subject, body: m.body, priority: m.priority ?? 'NORMALE',
      isAnnouncement: !!m.announcement, parentId: null, createdAt: date, sentAt: m.draft ? null : date,
      recipients: [...m.to.map((id) => ({ userId: id, type: 'TO' as const })), ...(m.cc ?? []).map((id) => ({ userId: id, type: 'CC' as const }))],
      groupTargets: (m.groups ?? []).map((groupId) => ({ groupId, type: 'TO' as const })),
      attachments: (m.attachments ?? []).map((a) => ({ ...a, id: attId++ })),
    };
    // Développement des listes en destinataires individuels (sans doublons)
    const seen = new Set(msg.recipients.map((r) => r.userId));
    for (const gt of msg.groupTargets) {
      const g = groups.find((x) => x.id === gt.groupId)!;
      for (const uid of membersOf(g, users)) {
        if (!seen.has(uid) && uid !== m.from) {
          seen.add(uid);
          msg.recipients.push({ userId: uid, type: gt.type });
        }
      }
    }
    db.messages.push(msg);
    db.boxes.push({ id: db.boxes.length + 1, messageId: msg.id, userId: m.from, type: 'FROM', folder: m.draft ? 'drafts' : 'sent', read: true, starred: false });
    if (!m.draft) {
      msg.recipients.forEach((r, k) => db.boxes.push({
        id: db.boxes.length + 1, messageId: msg.id, userId: r.userId, type: r.type, folder: 'inbox',
        read: m.days > 1 || k % 3 === 1, starred: i === 0 && r.userId === 7,
      }));
    }
  });

  const actions: [number | null, string, string, number][] = [
    [1, 'LOGIN', 'Connexion réussie', 0],
    [2, 'BROADCAST', 'Annonce « Convocation aux examens du premier semestre – L3 » → L3 – tous parcours', 0],
    [3, 'BROADCAST', 'Annonce « Réunion pédagogique du 6 novembre » → Tous les enseignants', 2],
    [1, 'USER_DISABLE', 'Compte désactivé : mamy.rasolofo@eni.mg', 3],
    [null, 'LOGIN_FAILED', 'Échec de connexion : inconnu@eni.mg', 4],
    [6, 'GROUP_CREATE', 'Liste créée : Club Dev ENI', 10],
    [1, 'USER_CREATE', 'Compte créé : aina.randriamampianina@eni.mg', 15],
  ];
  db.logs = actions.map(([userId, action, details, d], i) => ({ id: i + 1, userId, action, details, ip: '10.0.0.' + (10 + i), date: ago(d, i) }));
  return db;
}
