import { AbstractControl, ValidationErrors } from '@angular/forms';

/** RG12 : 12 caractères minimum, une majuscule, un chiffre et un symbole */
export function strongPassword(c: AbstractControl): ValidationErrors | null {
  const v = String(c.value ?? '');
  return v.length >= 12 && /[A-Z]/.test(v) && /\d/.test(v) && /[^A-Za-z0-9]/.test(v) ? null : { weak: true };
}

/** Indicateurs affichés sous un champ de mot de passe */
export function passwordRules(v: string): { ok: boolean; label: string }[] {
  return [
    { ok: v.length >= 12, label: '12 caractères' },
    { ok: /[A-Z]/.test(v), label: 'une majuscule' },
    { ok: /\d/.test(v), label: 'un chiffre' },
    { ok: /[^A-Za-z0-9]/.test(v), label: 'un symbole' },
  ];
}
