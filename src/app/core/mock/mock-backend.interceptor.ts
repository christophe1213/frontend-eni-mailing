import { HttpErrorResponse, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { from, Observable, of, throwError } from 'rxjs';
import { delay, mergeMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { toE164 } from '../../shared/phone';
import {
  AdminStats, AuditLog, BulkAction, ComposePayload, Folder, FolderCounts, GroupPayload, MailDetail, MailGroup,
  MailSummary, MailTemplate, OtpResponse, Page, RegisterPayload, RegisterResponse, Role, ROLE_RANK, TemplatePayload, User,
  UserPayload, UserSummary, VerifyResetOtpResponse,
} from '../models';
import { createSeedDb, DbBox, DbGroup, DbMessage, DbUser, DEMO_PASSWORD, MockDb, resolveGroupMembers } from './mock-data';

/**
 * Backend simulé : intercepte les appels `/api/**` et répond depuis une base en mémoire
 * (persistée dans localStorage). Permet de développer le frontend sans l'API Python.
 * Désactivé quand `environment.useMockApi` vaut false.
 */

const STORAGE_KEY = 'eni-mail-mock-db-v2';
let db: MockDb = loadDb();

function loadDb(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch { /* stockage indisponible */ }
  return createSeedDb();
}

function save(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch { /* ignoré */ }
}

export function resetMockDb(): void {
  db = createSeedDb();
  save();
}

// ---------- helpers ----------
class ApiError {
  constructor(public status: number, public message: string) {}
}

const fail = (status: number, message: string): never => { throw new ApiError(status, message); };
const nextId = (): number => ++db.seq;
const now = (): string => new Date().toISOString();

function publicUser({ password, ...rest }: DbUser): User {
  return rest;
}

function summary(id: number): UserSummary {
  const x = db.users.find((u) => u.id === id);
  return x
    ? { id: x.id, firstName: x.firstName, lastName: x.lastName, email: x.email, role: x.role, avatarUrl: x.avatarUrl ?? null }
    : { id, firstName: 'Utilisateur', lastName: 'supprimé', email: '', role: 'ETUDIANT' };
}

function paginate<T>(items: T[], params: URLSearchParams, defaultSize = 20): Page<T> {
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const pageSize = Number(params.get('pageSize') ?? defaultSize);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
}

function log(userId: number | null, action: string, details: string): void {
  db.logs.unshift({ id: nextId(), userId, action, details, ip: '127.0.0.1', date: now() });
}

function requireRole(me: DbUser, min: Role): void {
  if (ROLE_RANK[me.role] < ROLE_RANK[min]) fail(403, 'Accès refusé : droits insuffisants.');
}

const matches = (q: string | null, ...fields: (string | null | undefined)[]): boolean =>
  !q || fields.some((f) => f?.toLowerCase().includes(q.toLowerCase()));

// ---------- mails ----------
function toSummary(box: DbBox): MailSummary {
  const m = db.messages.find((x) => x.id === box.messageId)!;
  return {
    id: box.id,
    subject: m.subject,
    preview: m.body.replace(/\s+/g, ' ').slice(0, 140),
    from: summary(m.fromId),
    to: m.recipients.filter((r) => r.type === 'TO').map((r) => summary(r.userId)),
    date: m.sentAt ?? m.createdAt,
    read: box.read,
    starred: box.starred,
    folder: box.folder,
    priority: m.priority,
    isAnnouncement: m.isAnnouncement,
    hasAttachments: m.attachments.length > 0,
  };
}

function toDetail(box: DbBox): MailDetail {
  const m = db.messages.find((x) => x.id === box.messageId)!;
  const isSender = box.type === 'FROM';
  return {
    ...toSummary(box),
    body: m.body,
    // RG06 : les Cci ne sont visibles que par l'expéditeur
    recipients: m.recipients
      .filter((r) => isSender || r.type !== 'BCC' || r.userId === box.userId)
      .map((r) => ({ user: summary(r.userId), type: r.type })),
    groups: m.groupTargets.map((g) => ({ id: g.groupId, name: db.groups.find((x) => x.id === g.groupId)?.name ?? '?', type: g.type })),
    attachments: m.attachments,
    parentId: m.parentId,
  };
}

/** 1×1 px PNG : sert d'image de démonstration pour les pièces jointes de type image */
const MOCK_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==';

/** Contenu simulé d'une pièce jointe, selon son type (le vrai fichier n'existe qu'avec l'API réelle) */
function mockFileContent(a: { fileName: string; mimeType: string }): Blob {
  if (a.mimeType === 'application/pdf') {
    const label = a.fileName.replace(/[^\x20-\x7e]/g, '?').replace(/[()\\]/g, '');
    const stream = `BT /F1 20 Tf 60 780 Td (${label}) Tj 0 -32 Td /F1 12 Tf (Apercu simule - API reelle requise pour le vrai contenu.) Tj ET`;
    const pdf = '%PDF-1.4\n'
      + '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
      + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
      + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n'
      + `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj\n`
      + '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n'
      + 'trailer<</Root 1 0 R/Size 6>>\n%%EOF';
    return new Blob([pdf], { type: a.mimeType });
  }
  if (a.mimeType.startsWith('image/')) {
    return new Blob([Uint8Array.from(atob(MOCK_PNG), (c) => c.charCodeAt(0))], { type: 'image/png' });
  }
  if (a.mimeType.startsWith('text/')) {
    return new Blob([`${a.fileName}\n\nContenu de démonstration (backend simulé).\nLigne 2\nLigne 3\n`], { type: a.mimeType });
  }
  return new Blob(['Contenu de démonstration'], { type: 'application/octet-stream' });
}

/** GET /mails/attachments/:id — réservé à l'expéditeur et aux destinataires du message */
function attachmentBlob(me: DbUser, attId: number): Blob {
  const msg = db.messages.find((m) => m.attachments.some((a) => a.id === attId));
  if (!msg || !db.boxes.some((b) => b.messageId === msg.id && b.userId === me.id)) return fail(404, 'Pièce jointe introuvable.');
  return mockFileContent(msg.attachments.find((a) => a.id === attId)!);
}

function myBox(me: DbUser, id: number): DbBox {
  return db.boxes.find((b) => b.id === id && b.userId === me.id) ?? fail(404, 'Message introuvable.');
}

function listMails(me: DbUser, params: URLSearchParams): Page<MailSummary> {
  const folder = (params.get('folder') ?? 'inbox') as Folder;
  const q = params.get('q');
  const unread = params.get('unread') === 'true';
  const boxes = db.boxes
    .filter((b) => b.userId === me.id)
    .filter((b) => (folder === 'starred' ? b.starred && b.folder !== 'trash' : b.folder === folder))
    .filter((b) => !unread || !b.read)
    .map(toSummary)
    .filter((s) => matches(q, s.subject, s.preview, s.from.firstName, s.from.lastName, s.from.email))
    .sort((a, b) => b.date.localeCompare(a.date));
  return paginate(boxes, params);
}

function counts(me: DbUser): FolderCounts {
  const mine = db.boxes.filter((b) => b.userId === me.id);
  return {
    inbox: mine.filter((b) => b.folder === 'inbox' && !b.read).length,
    starred: mine.filter((b) => b.starred && b.folder !== 'trash').length,
    sent: mine.filter((b) => b.folder === 'sent').length,
    drafts: mine.filter((b) => b.folder === 'drafts').length,
    archive: mine.filter((b) => b.folder === 'archive' && !b.read).length,
    trash: mine.filter((b) => b.folder === 'trash').length,
  };
}

function validateCompose(me: DbUser, p: ComposePayload): void {
  if (p.draft) return;
  if (!p.to.length && !p.cc.length && !p.bcc.length && !p.groupIds.length) fail(422, 'Ajoutez au moins un destinataire.');
  if (!p.subject.trim()) fail(422, "L'objet du message est obligatoire.");
  for (const gid of p.groupIds) {
    const g = db.groups.find((x) => x.id === gid) ?? fail(404, 'Liste de diffusion introuvable.');
    if (me.role === 'ETUDIANT' && !g.openToStudents) fail(403, `La liste « ${g.name} » n'accepte pas les messages d'étudiants.`);
  }
  if (p.isAnnouncement) requireRole(me, 'PERSONNEL');
}

function buildRecipients(me: DbUser, p: ComposePayload): DbMessage['recipients'] {
  const seen = new Set<number>();
  const out: DbMessage['recipients'] = [];
  const add = (userId: number, type: 'TO' | 'CC' | 'BCC') => {
    if (!seen.has(userId)) { seen.add(userId); out.push({ userId, type }); }
  };
  p.to.forEach((id) => add(id, 'TO'));
  p.cc.forEach((id) => add(id, 'CC'));
  p.bcc.forEach((id) => add(id, 'BCC'));
  for (const gid of p.groupIds) {
    const g = db.groups.find((x) => x.id === gid);
    if (g) resolveGroupMembers(g, db.users).filter((id) => id !== me.id).forEach((id) => add(id, 'TO'));
  }
  return out;
}

function saveMail(me: DbUser, p: ComposePayload, draftBoxId?: number): MailDetail {
  validateCompose(me, p);
  let box: DbBox | undefined;
  let msg: DbMessage;
  if (draftBoxId) {
    box = myBox(me, draftBoxId);
    if (box.folder !== 'drafts') fail(409, 'Seul un brouillon peut être modifié (RG03).');
    msg = db.messages.find((x) => x.id === box!.messageId)!;
  } else {
    msg = {
      id: nextId(), fromId: me.id, subject: '', body: '', priority: 'NORMALE', isAnnouncement: false,
      parentId: null, createdAt: now(), sentAt: null, recipients: [], groupTargets: [], attachments: [],
    };
    db.messages.push(msg);
  }
  Object.assign(msg, {
    subject: p.subject, body: p.body, priority: p.priority, isAnnouncement: p.isAnnouncement, parentId: p.parentId ?? null,
    groupTargets: p.groupIds.map((groupId) => ({ groupId, type: 'TO' as const })),
  });
  // Brouillon : on garde les destinataires saisis tels quels
  msg.recipients = p.draft
    ? [...p.to.map((userId) => ({ userId, type: 'TO' as const })), ...p.cc.map((userId) => ({ userId, type: 'CC' as const })), ...p.bcc.map((userId) => ({ userId, type: 'BCC' as const }))]
    : buildRecipients(me, p);

  if (!box) {
    box = { id: nextId(), messageId: msg.id, userId: me.id, type: 'FROM', folder: 'drafts', read: true, starred: false };
    db.boxes.push(box);
  }
  if (!p.draft) {
    msg.sentAt = now();
    box.folder = 'sent';
    for (const r of msg.recipients) {
      db.boxes.push({ id: nextId(), messageId: msg.id, userId: r.userId, type: r.type, folder: 'inbox', read: false, starred: false });
    }
    if (msg.isAnnouncement || msg.recipients.length > 50 || p.groupIds.length) {
      log(me.id, 'BROADCAST', `« ${msg.subject} » → ${msg.recipients.length} destinataire(s)`);
    } else {
      log(me.id, 'SEND', `« ${msg.subject} » → ${msg.recipients.length} destinataire(s)`);
    }
  }
  save();
  return toDetail(box);
}

function bulk(me: DbUser, ids: number[], action: BulkAction): void {
  for (const id of ids) {
    const box = db.boxes.find((b) => b.id === id && b.userId === me.id);
    if (!box) continue;
    switch (action) {
      case 'read': box.read = true; break;
      case 'unread': box.read = false; break;
      case 'archive': box.folder = 'archive'; break;
      case 'trash': box.folder = 'trash'; break;
      case 'restore': box.folder = box.type === 'FROM' ? (db.messages.find((m) => m.id === box.messageId)?.sentAt ? 'sent' : 'drafts') : 'inbox'; break;
      case 'delete': db.boxes = db.boxes.filter((b) => b !== box); break;
    }
  }
  save();
}

// ---------- groups ----------
function toGroup(g: DbGroup, withMembers = false): MailGroup {
  const ids = resolveGroupMembers(g, db.users);
  return {
    id: g.id, name: g.name, address: g.address, description: g.description, type: g.type,
    criteriaRole: g.criteriaRole, criteriaLevel: g.criteriaLevel, criteriaTrack: g.criteriaTrack,
    openToStudents: g.openToStudents, owner: summary(g.ownerId), memberCount: ids.length, createdAt: g.createdAt,
    ...(withMembers ? { members: ids.map(summary) } : {}),
  };
}

function saveGroup(me: DbUser, p: GroupPayload, id?: number): MailGroup {
  requireRole(me, 'ENSEIGNANT');
  if (p.type === 'AUTO') requireRole(me, 'PERSONNEL');
  if (!p.name.trim()) fail(422, 'Le nom est obligatoire.');
  if (db.groups.some((g) => g.id !== id && (g.name === p.name || g.address === p.address))) fail(409, 'Nom ou adresse déjà utilisé.');
  let g = id ? db.groups.find((x) => x.id === id) ?? fail(404, 'Liste introuvable.') : undefined;
  if (g && g.ownerId !== me.id && me.role !== 'ADMIN') fail(403, 'Seul le propriétaire peut modifier cette liste.');
  const data = {
    name: p.name, address: p.address, description: p.description, type: p.type,
    criteriaRole: p.type === 'AUTO' ? p.criteriaRole ?? null : null,
    criteriaLevel: p.type === 'AUTO' ? p.criteriaLevel ?? null : null,
    criteriaTrack: p.type === 'AUTO' ? p.criteriaTrack ?? null : null,
    openToStudents: p.openToStudents, memberIds: p.type === 'MANUELLE' ? p.memberIds : [],
  };
  if (g) Object.assign(g, data);
  else {
    g = { id: nextId(), ownerId: me.id, createdAt: now(), ...data };
    db.groups.push(g);
    log(me.id, 'GROUP_CREATE', `Liste créée : ${g.name}`);
  }
  save();
  return toGroup(g, true);
}

// ---------- users ----------
function saveUser(me: DbUser, p: UserPayload, id?: number): User {
  requireRole(me, 'ADMIN');
  if (db.users.some((x) => x.id !== id && x.email.toLowerCase() === p.email.toLowerCase())) fail(409, 'Cette adresse e-mail est déjà utilisée (RG01).');
  if (db.users.some((x) => x.id !== id && x.matricule === p.matricule)) fail(409, 'Ce matricule est déjà utilisé (RG01).');
  if (p.role === 'ETUDIANT' && !p.level) fail(422, 'Un étudiant doit avoir un niveau (RG02).');
  const clean = { ...p, phone: cleanPhone(p.phone), level: p.role === 'ETUDIANT' ? p.level : null, track: p.role === 'ETUDIANT' ? p.track : null };
  let target: DbUser;
  if (id) {
    target = db.users.find((x) => x.id === id) ?? fail(404, 'Utilisateur introuvable.');
    Object.assign(target, clean);
    log(me.id, 'USER_UPDATE', `Compte modifié : ${target.email}`);
  } else {
    target = { ...clean, id: nextId(), password: DEMO_PASSWORD, signature: null, notifEmail: true, createdAt: now(), lastLoginAt: null };
    db.users.push(target);
    log(me.id, 'USER_CREATE', `Compte créé : ${target.email}`);
  }
  save();
  return publicUser(target);
}

function stats(): AdminStats {
  const sent = db.messages.filter((m) => m.sentAt);
  const today = new Date().toISOString().slice(0, 10);
  const byRole = { ADMIN: 0, PERSONNEL: 0, ENSEIGNANT: 0, ETUDIANT: 0 } as Record<Role, number>;
  db.users.forEach((x) => byRole[x.role]++);
  const activity = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date: d, count: sent.filter((m) => m.sentAt!.startsWith(d)).length };
  });
  const senders = new Map<number, number>();
  sent.forEach((m) => senders.set(m.fromId, (senders.get(m.fromId) ?? 0) + 1));
  return {
    users: { total: db.users.length, active: db.users.filter((x) => x.active).length, byRole },
    messagesSent: sent.length,
    messagesToday: sent.filter((m) => m.sentAt!.startsWith(today)).length,
    announcements: sent.filter((m) => m.isAnnouncement).length,
    groups: db.groups.length,
    activity,
    topSenders: [...senders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => ({ user: summary(id), count })),
  };
}

// ---------- téléphone ----------
const PHONE_RULE = 'Numéro de téléphone invalide : indicatif pays non géré ou nombre de chiffres incorrect (Madagascar : 10 chiffres, opérateur 032, 033, 034, 037, 038 ou 039, ex. 034 12 345 67).';

/** Normalise avant stockage : un seul format en base (E.164, ex. « +261341234567 », 13 caractères) ; vide → null */
function cleanPhone(raw: string | null | undefined, required = false): string | null {
  if (!raw?.trim()) {
    if (required) fail(422, 'Le numéro de téléphone est obligatoire.');
    return null;
  }
  return toE164(raw) ?? fail(422, PHONE_RULE);
}

// ---------- inscription ----------
/** RG12 : 12 caractères minimum, une majuscule, un chiffre et un symbole */
const STRONG_PASSWORD = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
const PASSWORD_RULE = 'Le mot de passe doit contenir au moins 12 caractères, une majuscule, un chiffre et un symbole (RG12).';

// ---------- codes OTP (simulés) ----------
/** Code accepté en mode démonstration (aucun e-mail n'est envoyé) */
const MOCK_OTP = '123456';
const OTP_TTL_MS = 5 * 60_000;
const OTP_COOLDOWN_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;

interface MockOtp { code: string; createdAt: number; expiresAt: number; attempts: number; }
/** Clé `${id utilisateur}:${objectif}` — en mémoire seulement, comme un cache serveur */
const otps = new Map<string, MockOtp>();
/** Jetons de réinitialisation émis après un code valide : jeton → id utilisateur */
const resetTokens = new Map<string, number>();

const otpKey = (userId: number, purpose: string): string => `${userId}:${purpose}`;
/** Un compte créé par inscription en ligne reste « non vérifié » (persisté) jusqu'à la validation du code */
const isUnverified = (u: DbUser): boolean => u.emailVerified === false;

function createOtp(userId: number, purpose: string): void {
  const last = otps.get(otpKey(userId, purpose));
  const wait = last ? Math.ceil((last.createdAt + OTP_COOLDOWN_MS - Date.now()) / 1000) : 0;
  if (wait > 0) fail(429, `Veuillez patienter ${wait} secondes avant de demander un nouveau code.`);
  const t = Date.now();
  otps.set(otpKey(userId, purpose), { code: MOCK_OTP, createdAt: t, expiresAt: t + OTP_TTL_MS, attempts: 0 });
  console.info(`[mock] Code OTP ${purpose} pour l'utilisateur #${userId} : ${MOCK_OTP}`);
}

function checkOtp(userId: number, code: string, purpose: string): void {
  const key = otpKey(userId, purpose);
  const otp = otps.get(key);
  if (!otp) fail(400, 'Aucun code de vérification valide trouvé. Veuillez demander un nouveau code.');
  if (Date.now() > otp!.expiresAt) {
    otps.delete(key);
    fail(400, 'Le code de vérification a expiré. Veuillez demander un nouveau code.');
  }
  if (otp!.code !== String(code)) {
    otp!.attempts++;
    const left = OTP_MAX_ATTEMPTS - otp!.attempts;
    if (left <= 0) {
      otps.delete(key);
      fail(400, 'Code incorrect. Nombre maximal de tentatives atteint, le code a été invalidé.');
    }
    fail(400, `Code de vérification incorrect. Tentatives restantes : ${left}.`);
  }
  otps.delete(key);
}

const userByEmail = (email: string): DbUser | undefined =>
  db.users.find((x) => x.email.toLowerCase() === String(email ?? '').trim().toLowerCase());

function register(p: RegisterPayload): RegisterResponse {
  if (!p.firstName?.trim() || !p.lastName?.trim() || !p.email?.trim() || !p.matricule?.trim()) fail(422, 'Champs obligatoires manquants.');
  if (!p.email.toLowerCase().endsWith(`@${environment.mailDomain}`)) fail(422, `Utilisez votre adresse institutionnelle @${environment.mailDomain}.`);
  const emailVerification = p.emailVerification?.trim().toLowerCase();
  if (!emailVerification) fail(422, "L'adresse e-mail de vérification est obligatoire.");
  if (emailVerification === p.email.trim().toLowerCase()) fail(422, "L'e-mail de vérification doit être différent de l'e-mail ENI.");
  if (db.users.some((x) => x.email.toLowerCase() === p.email.toLowerCase())) fail(409, 'Un compte existe déjà avec cette adresse e-mail (RG01).');
  if (db.users.some((x) => x.emailVerification === emailVerification)) fail(409, 'Cette adresse e-mail de vérification est déjà utilisée.');
  if (db.users.some((x) => x.matricule === p.matricule)) fail(409, 'Cet identifiant est déjà associé à un compte (RG01).');
  if (p.role === 'ETUDIANT' && !p.level) fail(422, 'Le niveau est obligatoire pour un étudiant (RG02).');
  if (!STRONG_PASSWORD.test(p.password)) fail(422, PASSWORD_RULE);
  const phone = cleanPhone(p.phone, true);

  const position = p.role === 'ENSEIGNANT'
    ? `Enseignant${p.teacherStatus === 'VACATAIRE' ? ' vacataire' : ''} – ${p.specialty ?? ''}`.trim()
    : p.role === 'ETUDIANT' ? null : [p.position, p.department].filter(Boolean).join(' – ');
  const user: DbUser = {
    id: nextId(), matricule: p.matricule.trim(), firstName: p.firstName.trim(), lastName: p.lastName.trim(),
    email: p.email.trim().toLowerCase(), role: p.role, level: p.role === 'ETUDIANT' ? p.level ?? null : null,
    track: p.role === 'ETUDIANT' ? p.track ?? null : null, position, phone, signature: null, notifEmail: true,
    active: false, pending: true, createdAt: now(), lastLoginAt: null, password: p.password,
    emailVerification, emailVerified: false,
  };
  db.users.push(user);
  createOtp(user.id, 'REGISTER');
  log(null, 'REGISTER', `Demande d'inscription (${p.role}) : ${user.email}${p.role === 'ADMIN' ? ' — validation renforcée requise' : ''}`);
  save();
  return { email: user.email, pending: true, is_verified: false, message: 'Inscription enregistrée. Un code OTP de validation a été envoyé à votre adresse e-mail.' };
}

// ---------- routeur ----------
function currentUser(req: HttpRequest<unknown>): DbUser {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const id = Number(token.replace('mock-token-', ''));
  const me = db.users.find((x) => x.id === id && x.active);
  return me ?? fail(401, 'Session expirée, veuillez vous reconnecter.');
}

function handle(req: HttpRequest<unknown>, path: string, params: URLSearchParams, avatarData?: string): unknown {
  const { method } = req;
  const body = req.body as any;
  const seg = path.split('/').filter(Boolean);
  const id = Number(seg[1]);

  // --- public ---
  if (path === '/auth/login' && method === 'POST') {
    const user = db.users.find((x) => x.email.toLowerCase() === String(body.email).toLowerCase());
    if (!user || user.password !== body.password) {
      log(null, 'LOGIN_FAILED', `Échec de connexion : ${body.email}`); save();
      return fail(401, 'Adresse e-mail ou mot de passe incorrect.');
    }
    if (isUnverified(user)) return fail(403, 'Votre adresse e-mail n\'a pas encore été vérifiée par code OTP.');
    if (user.pending) return fail(403, 'Votre demande d\'inscription est en cours de vérification par l\'administration.');
    if (!user.active) return fail(403, 'Ce compte est désactivé. Contactez l\'administrateur (RG11).');
    user.lastLoginAt = now();
    log(user.id, 'LOGIN', 'Connexion réussie'); save();
    return { token: `mock-token-${user.id}`, user: publicUser(user) };
  }
  if (path === '/auth/register' && method === 'POST') return register(body as RegisterPayload);
  if (path === '/auth/verify-otp' && method === 'POST') {
    const user = userByEmail(body.email) ?? fail(404, 'Aucun compte associé à cette adresse e-mail.');
    const purpose = body.purpose ?? 'REGISTER';
    if (purpose === 'REGISTER' && !isUnverified(user)) {
      return { success: true, message: 'Votre adresse e-mail est déjà vérifiée. Votre compte est en attente de validation administrative.' } satisfies OtpResponse;
    }
    checkOtp(user.id, body.code, purpose);
    if (purpose === 'REGISTER') user.emailVerified = true;
    log(user.id, 'OTP_VERIFIED', `Code vérifié (${purpose}) : ${user.email}`); save();
    return { success: true, message: 'Adresse e-mail vérifiée avec succès.' } satisfies OtpResponse;
  }
  if (path === '/auth/resend-otp' && method === 'POST') {
    const user = userByEmail(body.email);
    // Réponse générique si le compte n'existe pas (pas d'énumération)
    if (user) createOtp(user.id, body.purpose ?? 'REGISTER');
    return { success: true, message: 'Un nouveau code de vérification vous a été envoyé par e-mail.' } satisfies OtpResponse;
  }
  if (path === '/auth/forgot-password' && method === 'POST') {
    // Démo : tout compte actif reçoit un code (le backend réel exige en plus un e-mail de vérification validé)
    const user = userByEmail(body.email);
    if (user?.active) createOtp(user.id, 'PASSWORD_RESET');
    return { success: true, message: 'Si un compte est associé à cette adresse e-mail, un code de réinitialisation vous a été envoyé.' } satisfies OtpResponse;
  }
  if (path === '/auth/verify-reset-otp' && method === 'POST') {
    const user = userByEmail(body.email) ?? fail(400, 'Code de vérification invalide ou expiré.');
    checkOtp(user.id, body.code, 'PASSWORD_RESET');
    const resetToken = `mock-reset-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    resetTokens.set(resetToken, user.id);
    return { success: true, resetToken, message: 'Code vérifié. Vous pouvez maintenant choisir votre nouveau mot de passe.' } satisfies VerifyResetOtpResponse;
  }
  if (path === '/auth/reset-password' && method === 'POST') {
    const user = userByEmail(body.email);
    if (!user || resetTokens.get(body.resetToken) !== user.id) fail(400, 'Le jeton de réinitialisation est invalide ou a expiré.');
    if (!STRONG_PASSWORD.test(body.newPassword)) fail(422, PASSWORD_RULE);
    user!.password = body.newPassword;
    resetTokens.delete(body.resetToken);
    log(user!.id, 'PASSWORD_RESET_SUCCESS', `Mot de passe réinitialisé : ${user!.email}`); save();
    return { success: true, message: 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.' } satisfies OtpResponse;
  }

  const me = currentUser(req);

  // --- auth / profil ---
  if (path === '/auth/me' && method === 'GET') return publicUser(me);
  if (path === '/auth/me' && method === 'PUT') {
    const { phone, signature, notifEmail } = body as Partial<User>;
    Object.assign(me, { phone: cleanPhone(phone), signature, notifEmail }); save();
    return publicUser(me);
  }
  if (path === '/auth/me/avatar' && method === 'POST') {
    if (!avatarData) fail(422, 'Aucune image reçue.');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(avatarData!)) fail(422, 'Format non pris en charge (JPEG, PNG ou WebP).');
    me.avatarUrl = avatarData; save();
    return publicUser(me);
  }
  if (path === '/auth/me/avatar' && method === 'DELETE') {
    me.avatarUrl = null; save();
    return publicUser(me);
  }
  if (path === '/auth/change-password' && method === 'POST') {
    if (body.currentPassword !== me.password) fail(422, 'Mot de passe actuel incorrect.');
    if (!STRONG_PASSWORD.test(body.newPassword)) fail(422, PASSWORD_RULE);
    me.password = body.newPassword; save();
    return null;
  }

  // --- mails ---
  if (seg[0] === 'mails') {
    if (path === '/mails' && method === 'GET') return listMails(me, params);
    if (path === '/mails' && method === 'POST') return saveMail(me, body);
    if (path === '/mails/counts') return counts(me);
    if (path === '/mails/bulk' && method === 'POST') { bulk(me, body.ids, body.action); return null; }
    if (path === '/mails/attachments' && method === 'POST') {
      const file = (body as FormData).get('file') as File;
      if (file.size > 10 * 1024 * 1024) fail(422, 'Fichier trop volumineux (10 Mo max, RG09).');
      if (/\.(exe|bat|cmd|js|vbs)$/i.test(file.name)) fail(422, 'Type de fichier interdit (RG09).');
      return { id: nextId(), fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size };
    }
    if (seg[1] === 'attachments' && method === 'GET') return attachmentBlob(me, Number(seg[2]));
    const box = myBox(me, id);
    if (method === 'GET') {
      if (!box.read) { box.read = true; save(); }
      return toDetail(box);
    }
    if (method === 'PUT') return saveMail(me, body, id);
    if (method === 'PATCH') {
      if (body.read !== undefined) box.read = body.read;
      if (body.starred !== undefined) box.starred = body.starred;
      if (body.folder !== undefined) box.folder = body.folder;
      save();
      return toSummary(box);
    }
    if (method === 'DELETE') { bulk(me, [id], box.folder === 'trash' ? 'delete' : 'trash'); return null; }
  }

  // --- users ---
  if (seg[0] === 'users') {
    // Annuaire personnel : /users/{userId}/contacts — carnet privé, réservé à son propriétaire
    if (seg[2] === 'contacts') {
      if (id !== me.id) fail(403, 'Accès refusé : ce carnet est privé.');
      const all = (db.contacts ??= []);
      const mine = all.filter((c) => c.userId === me.id);
      if (seg.length === 3 && method === 'GET') {
        const q = params.get('q');
        const list = mine
          .map((c) => db.users.find((u) => u.id === c.contactUserId))
          .filter((u): u is DbUser => !!u && u.active)
          .filter((u) => matches(q, u.firstName, u.lastName, u.email, u.matricule, u.position))
          .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr'))
          .map(publicUser);
        return paginate(list, params, 50);
      }
      if (seg.length === 3 && method === 'POST') {
        const target = db.users.find((u) => u.id === body?.contactUserId) ?? fail(404, 'Utilisateur introuvable.');
        if (target.id === me.id) fail(422, 'Vous ne pouvez pas vous ajouter vous-même.');
        if (mine.some((c) => c.contactUserId === target.id)) fail(409, 'Cet utilisateur est déjà dans votre annuaire.');
        all.push({ id: nextId(), userId: me.id, contactUserId: target.id });
        save();
        return publicUser(target);
      }
      if (seg.length === 5 && seg[4] === 'exists' && method === 'GET') {
        return { exists: mine.some((c) => c.contactUserId === Number(seg[3])) };
      }
      if (seg.length === 4 && method === 'DELETE') {
        const entry = mine.find((c) => c.contactUserId === Number(seg[3])) ?? fail(404, 'Contact introuvable.');
        db.contacts = all.filter((c) => c !== entry);
        save();
        return null;
      }
    }
    if (path === '/users' && method === 'GET') {
      const q = params.get('q'); const role = params.get('role'); const level = params.get('level');
      const track = params.get('track'); const active = params.get('active');
      const list = db.users
        .filter((x) => matches(q, x.firstName, x.lastName, x.email, x.matricule, x.position))
        .filter((x) => !role || x.role === role)
        .filter((x) => !level || x.level === level)
        .filter((x) => !track || x.track === track)
        .filter((x) => active === null || active === '' || (active === 'pending' ? !!x.pending : String(x.active) === active))
        .sort((a, b) => a.lastName.localeCompare(b.lastName))
        .map(publicUser);
      return paginate(list, params, 50);
    }
    if (path === '/users' && method === 'POST') return saveUser(me, body);
    const target = db.users.find((x) => x.id === id) ?? fail(404, 'Utilisateur introuvable.');
    if (method === 'GET') return publicUser(target);
    if (method === 'PUT') return saveUser(me, body, id);
    if (seg[2] === 'active' && method === 'PATCH') {
      requireRole(me, 'ADMIN');
      if (target.id === me.id) fail(409, 'Vous ne pouvez pas désactiver votre propre compte.');
      target.active = body.active;
      target.pending = false;
      log(me.id, body.active ? 'USER_ENABLE' : 'USER_DISABLE', `Compte ${body.active ? 'activé' : 'désactivé'} : ${target.email}`);
      save();
      return publicUser(target);
    }
    if (seg[2] === 'reset-password' && method === 'POST') {
      requireRole(me, 'ADMIN');
      target.password = DEMO_PASSWORD;
      log(me.id, 'USER_RESET_PASSWORD', `Mot de passe réinitialisé : ${target.email}`); save();
      return null;
    }
  }

  // --- groups ---
  if (seg[0] === 'groups') {
    if (path === '/groups' && method === 'GET') {
      const q = params.get('q');
      return db.groups.filter((g) => matches(q, g.name, g.address, g.description)).map((g) => toGroup(g));
    }
    if (path === '/groups' && method === 'POST') return saveGroup(me, body);
    const g = db.groups.find((x) => x.id === id) ?? fail(404, 'Liste introuvable.');
    if (method === 'GET') return toGroup(g, true);
    if (method === 'PUT') return saveGroup(me, body, id);
    if (method === 'DELETE') {
      if (g.ownerId !== me.id && me.role !== 'ADMIN') fail(403, 'Seul le propriétaire peut supprimer cette liste.');
      db.groups = db.groups.filter((x) => x !== g);
      log(me.id, 'GROUP_DELETE', `Liste supprimée : ${g.name}`); save();
      return null;
    }
  }

  // --- templates ---
  if (seg[0] === 'templates') {
    requireRole(me, 'PERSONNEL');
    const toTpl = (t: typeof db.templates[number]): MailTemplate => {
      const { authorId, ...rest } = t;
      return { ...rest, author: summary(authorId) };
    };
    if (path === '/templates' && method === 'GET') return db.templates.map(toTpl);
    if (path === '/templates' && method === 'POST') {
      const t = { ...(body as TemplatePayload), id: nextId(), authorId: me.id, updatedAt: now() };
      db.templates.push(t); save();
      return toTpl(t);
    }
    const t = db.templates.find((x) => x.id === id) ?? fail(404, 'Modèle introuvable.');
    if (method === 'GET') return toTpl(t);
    if (method === 'PUT') { Object.assign(t, body as TemplatePayload, { updatedAt: now() }); save(); return toTpl(t); }
    if (method === 'DELETE') { db.templates = db.templates.filter((x) => x !== t); save(); return null; }
  }

  // --- admin ---
  if (seg[0] === 'admin') {
    requireRole(me, 'ADMIN');
    if (path === '/admin/stats') return stats();
    if (path === '/admin/logs') {
      const q = params.get('q'); const action = params.get('action');
      const logs: AuditLog[] = db.logs
        .filter((l) => !action || l.action === action)
        .map((l) => ({ id: l.id, user: l.userId ? summary(l.userId) : null, action: l.action, details: l.details, ip: l.ip, date: l.date }))
        .filter((l) => matches(q, l.details, l.user?.email));
      return paginate(logs, params, 25);
    }
  }

  return fail(404, `Route simulée inconnue : ${method} ${path}`);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export const mockBackendInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.useMockApi || !req.url.startsWith(environment.apiUrl)) return next(req);
  const path = req.url.slice(environment.apiUrl.length).split('?')[0];
  const params = new URLSearchParams(req.urlWithParams.split('?')[1] ?? '');

  // Envoi de photo : on lit l'image (FormData) en data URL pour la stocker dans la base simulée
  const file = req.body instanceof FormData ? req.body.get('file') : null;
  const avatarData$: Observable<string | undefined> =
    path === '/auth/me/avatar' && req.method === 'POST' && file instanceof Blob ? from(blobToDataUrl(file)) : of(undefined);

  return avatarData$.pipe(
    delay(200 + Math.random() * 200), // latence réseau simulée
    mergeMap((avatarData): Observable<HttpResponse<unknown>> => {
      try {
        const body = handle(req, path, params, avatarData);
        return of(new HttpResponse({ status: body === null ? 204 : 200, body, url: req.url }));
      } catch (e) {
        if (e instanceof ApiError) {
          return throwError(() => new HttpErrorResponse({ status: e.status, error: { message: e.message }, url: req.url }));
        }
        console.error('[mock-api]', e);
        return throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Erreur interne du serveur simulé.' }, url: req.url }));
      }
    }),
  );
};
