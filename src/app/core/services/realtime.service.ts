import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { ToastService } from './toast.service';

/** Événements poussés par le backend sur le WebSocket `/api/ws` */
export type RealtimeEvent =
  | { type: 'mail.new'; mailId: number; from?: string; subject?: string }
  | { type: 'counts.changed' };

const PING_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Connexion temps réel avec le backend.
 * - `mail.new`       → compteur +1 immédiat, son, toast cliquable, rafraîchissement de la boîte de réception
 * - `counts.changed` → mise à jour des compteurs (action faite dans un autre onglet)
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private auth = inject(AuthService);
  private mail = inject(MailService);
  private toast = inject(ToastService);
  private router = inject(Router);

  /** Émet quand la boîte de réception a pu changer (nouveau mail, ou reconnexion après une coupure) */
  readonly inboxChanged$ = new Subject<void>();

  private ws: WebSocket | null = null;
  private wanted = false;
  private retries = 0;
  private everConnected = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private audioCtx: AudioContext | null = null;

  constructor() {
    // Les navigateurs interdisent de jouer un son tant que l'utilisateur n'a pas cliqué ou tapé
    // au moins une fois dans la page : on « débloque » l'audio au premier geste.
    const unlock = () => {
      try {
        this.audioCtx ??= new AudioContext();
        void this.audioCtx.resume();
      } catch { /* audio indisponible : tant pis pour le son */ }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  connect(): void {
    // En mode démo (backend simulé dans le navigateur) il n'y a pas de WebSocket
    if (this.wanted || environment.useMockApi) return;
    if (!this.auth.token()) return;
    this.wanted = true;
    this.open();
  }

  disconnect(): void {
    this.wanted = false;
    this.everConnected = false;
    this.retries = 0;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.cleanupSocket();
    this.ws?.close();
    this.ws = null;
  }

  private open(): void {
    const token = this.auth.token();
    if (!token) return;

    const ws = new WebSocket(this.url(token));
    this.ws = ws;

    ws.onopen = () => {
      this.debug('connecté');
      this.retries = 0;
      // Après une coupure, on a pu rater des événements : on resynchronise
      if (this.everConnected) {
        this.mail.refreshCounts();
        this.inboxChanged$.next();
      }
      this.everConnected = true;
      this.pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
    };

    ws.onmessage = (msg) => {
      if (msg.data === 'pong') return;
      let event: RealtimeEvent;
      try {
        event = JSON.parse(msg.data) as RealtimeEvent;
      } catch {
        console.warn('[realtime] message illisible', msg.data);
        return;
      }
      this.debug('reçu', event);
      this.handle(event);
    };

    ws.onclose = (e) => {
      this.debug(`fermé (code ${e.code})`);
      this.cleanupSocket();
      // 1008 = jeton refusé : inutile de réessayer (le 401 d'une requête HTTP déconnectera l'utilisateur)
      if (!this.wanted || e.code === 1008) return;
      const delay = Math.min(1000 * 2 ** this.retries++, MAX_BACKOFF_MS);
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
  }

  private handle(e: RealtimeEvent): void {
    switch (e.type) {
      case 'mail.new': {
        // 1. Compteur de la boîte de réception : +1 tout de suite, puis on se cale sur la vraie valeur du serveur
        this.mail.counts.update((c) => (c ? { ...c, inbox: c.inbox + 1 } : c));
        this.mail.refreshCounts();

        // 2. Son + toast cliquable
        this.playSound();
        const subject = e.subject?.trim() ? e.subject.trim() : '(sans objet)';
        const short = subject.length > 60 ? subject.slice(0, 57) + '…' : subject;
        this.toast.show(
          `Nouveau message de ${e.from ?? 'un expéditeur'} : ${short}`,
          'info',
          6000,
          () => this.router.navigate(['/mail', 'inbox', e.mailId]),
        );

        // 3. Liste des messages
        this.inboxChanged$.next();
        break;
      }
      case 'counts.changed':
        this.mail.refreshCounts();
        break;
    }
  }

  /** Petit carillon à deux notes, généré par le navigateur (aucun fichier audio nécessaire) */
  private playSound(): void {
    const ctx = this.audioCtx;
    if (!ctx || ctx.state !== 'running') {
      this.debug('son ignoré : cliquez une fois dans la page pour activer l’audio');
      return;
    }
    const now = ctx.currentTime;
    const notes: [number, number][] = [[880, 0], [1318.5, 0.14]]; // [fréquence Hz, décalage s]
    for (const [freq, offset] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.4);
    }
  }

  private cleanupSocket(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /** Journal dans la console du navigateur (F12), uniquement en développement */
  private debug(...args: unknown[]): void {
    if (!environment.production) console.debug('[realtime]', ...args);
  }

  /** `/api` (proxy du dev-server ou même domaine) ou URL absolue → URL ws:// ou wss:// */
  private url(token: string): string {
    const api = environment.apiUrl;
    const base = api.startsWith('http')
      ? api.replace(/^http/, 'ws')
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${api}`;
    return `${base}/ws?token=${encodeURIComponent(token)}`;
  }
}