import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, inject, signal } from '@angular/core';

/** Nombre de chiffres du code OTP : à aligner sur otp_service côté backend */
export const OTP_LENGTH = 6;

/** Délai minimal imposé par le backend entre deux envois de code (HTTP 429 en deçà de 60 s) */
export const OTP_RESEND_SECONDS = 60;

/**
 * Compte à rebours en secondes (ex. bouton « Renvoyer le code »).
 * À appeler dans un contexte d'injection (champ de composant) : le minuteur est arrêté à la destruction.
 */
export function useCooldown() {
  const remaining = signal(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  inject(DestroyRef).onDestroy(stop);

  return {
    remaining: remaining.asReadonly(),
    start(seconds: number): void {
      stop();
      remaining.set(Math.max(0, seconds));
      if (remaining() === 0) return;
      timer = setInterval(() => {
        remaining.update((r) => r - 1);
        if (remaining() <= 0) stop();
      }, 1000);
    },
  };
}

/** Le backend répond 429 « Veuillez patienter N secondes… » quand un code a été envoyé il y a moins d'une minute */
export function isRateLimited(err: unknown): err is HttpErrorResponse {
  return err instanceof HttpErrorResponse && err.status === 429;
}

/** Extrait « N secondes » du message d'erreur du backend (60 s par défaut) */
export function secondsFromMessage(message: string, fallback = OTP_RESEND_SECONDS): number {
  const m = /(\d+)\s*secondes?/i.exec(message);
  return m ? Number(m[1]) : fallback;
}
