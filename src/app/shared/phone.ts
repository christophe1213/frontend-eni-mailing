// Numéros de téléphone : saisie locale du pays choisi (ex. Madagascar « 034 12 345 67 »), stockage unique au format E.164 (« +261341234567 »)

export interface Country {
  /** Code ISO 3166-1 alpha-2 */
  iso: string;
  name: string;
  /** Indicatif sans le « + » */
  dial: string;
  /** Préfixe national (« 0 ») saisi en local mais retiré en international ; '' si le pays n'en a pas */
  trunk: string;
  /** Nombre de chiffres du numéro national, sans préfixe national */
  nsn: number;
  /** Regroupement d'affichage du numéro local (préfixe national inclus) */
  groups: readonly number[];
  /** Numéro d'exemple, au format local */
  example: string;
  /** Préfixes locaux valides (opérateurs), si on les contrôle */
  prefixes?: readonly string[];
}

/** Préfixes mobiles valides à Madagascar (opérateurs) — à compléter si l'ARTEC en attribue de nouveaux */
export const MOBILE_PREFIXES = ['032', '033', '034', '037', '038', '039'] as const;

/** Pays proposés dans le sélecteur (Madagascar en premier, c'est le pays par défaut) */
export const COUNTRIES: readonly Country[] = [
  { iso: 'MG', name: 'Madagascar', dial: '261', trunk: '0', nsn: 9, groups: [3, 2, 3, 2], example: '034 12 345 67', prefixes: MOBILE_PREFIXES },
  { iso: 'FR', name: 'France', dial: '33', trunk: '0', nsn: 9, groups: [2, 2, 2, 2, 2], example: '06 12 34 56 78' },
  { iso: 'RE', name: 'La Réunion / Mayotte', dial: '262', trunk: '0', nsn: 9, groups: [4, 2, 2, 2], example: '0692 12 34 56' },
  { iso: 'KM', name: 'Comores', dial: '269', trunk: '', nsn: 7, groups: [3, 2, 2], example: '321 23 45' },
  { iso: 'MU', name: 'Maurice', dial: '230', trunk: '', nsn: 8, groups: [4, 4], example: '5251 2345' },
  { iso: 'SN', name: 'Sénégal', dial: '221', trunk: '', nsn: 9, groups: [2, 3, 2, 2], example: '77 123 45 67' },
  { iso: 'CI', name: 'Côte d’Ivoire', dial: '225', trunk: '', nsn: 10, groups: [2, 2, 2, 2, 2], example: '07 12 34 56 78' },
  { iso: 'CM', name: 'Cameroun', dial: '237', trunk: '', nsn: 9, groups: [1, 2, 2, 2, 2], example: '6 71 23 45 67' },
  { iso: 'MA', name: 'Maroc', dial: '212', trunk: '0', nsn: 9, groups: [2, 2, 2, 2, 2], example: '06 12 34 56 78' },
  { iso: 'GB', name: 'Royaume-Uni', dial: '44', trunk: '0', nsn: 10, groups: [5, 6], example: '07911 123456' },
  { iso: 'US', name: 'États-Unis / Canada', dial: '1', trunk: '', nsn: 10, groups: [3, 3, 4], example: '415 555 2671' },
];

export const DEFAULT_COUNTRY: Country = COUNTRIES[0];
export const COUNTRY_CODE = '+' + DEFAULT_COUNTRY.dial;
/** Chiffres d'un numéro local malgache, 0 initial inclus */
export const LOCAL_LENGTH = DEFAULT_COUNTRY.trunk.length + DEFAULT_COUNTRY.nsn;

export type PhoneIssue = 'length' | 'operator' | 'country';

export function countryByIso(iso: string | null | undefined): Country {
  return COUNTRIES.find((c) => c.iso === iso) ?? DEFAULT_COUNTRY;
}

/** Nombre de chiffres du numéro local (préfixe national inclus) */
export function localLength(c: Country): number {
  return c.trunk.length + c.nsn;
}

/** Une saisie est « internationale » si elle commence par « + » ou « 00 » */
function isInternational(raw: string): boolean {
  const s = raw.trim();
  return s.startsWith('+') || s.replace(/\D/g, '').startsWith('00');
}

/** Pays déduit de l'indicatif d'une saisie internationale (« +33… », « 0033… »), ou null (saisie locale ou indicatif inconnu) */
export function detectCountry(raw: string | null | undefined): Country | null {
  const s = String(raw ?? '');
  if (!isInternational(s)) return null;
  const d = s.replace(/\D/g, '').replace(/^00/, '');
  return COUNTRIES.find((c) => d.startsWith(c.dial)) ?? null;
}

/**
 * Extrait les chiffres au format local du pays (« 0341234567 ») depuis une saisie quelconque :
 * espaces, tirets, points et parenthèses ignorés ; « +261 », « 00261 » et « 261 » (numéro complet) retirés ;
 * préfixe national (« 0 ») ajouté s'il manque. Un numéro d'un autre indicatif (« +33… » pour Madagascar) est renvoyé tel quel
 * préfixé de « 00 » pour être rejeté.
 * `truncate` limite à la longueur du pays (saisie) ; l'API passe `false` pour rejeter les numéros trop longs.
 */
export function toLocalDigits(raw: string | null | undefined, truncate = true, country: Country = DEFAULT_COUNTRY): string {
  const s = String(raw ?? '').trim();
  let d = s.replace(/\D/g, '');
  if (!d) return '';
  const max = localLength(country);
  if (isInternational(s)) {
    d = d.replace(/^00/, '');
    if (!d.startsWith(country.dial)) {
      const foreign = '00' + d;
      return truncate ? foreign.slice(0, max) : foreign;
    }
    d = d.slice(country.dial.length);
  } else if (d.startsWith(country.dial) && d.length >= country.dial.length + country.nsn) {
    d = d.slice(country.dial.length);
  }
  if (d && country.trunk && !d.startsWith(country.trunk)) d = country.trunk + d;
  return truncate ? d.slice(0, max) : d;
}

/** 034 12 345 67 — regroupement propre au pays (fonctionne aussi sur un numéro incomplet) */
export function formatLocal(local: string, country: Country = DEFAULT_COUNTRY): string {
  const parts: string[] = [];
  let i = 0;
  for (const g of country.groups) {
    parts.push(local.slice(i, i + g));
    i += g;
  }
  return parts.filter(Boolean).join(' ');
}

/** 34 12 345 67 — numéro sans préfixe national, tel qu'on l'écrit après l'indicatif (« +261 34 12 345 67 ») */
export function formatNational(local: string, country: Country = DEFAULT_COUNTRY): string {
  const groups = [...country.groups];
  groups[0] -= country.trunk.length;
  return formatLocal(local.slice(country.trunk.length), { ...country, groups });
}

/** Le début saisi est-il compatible avec un préfixe d'opérateur valide ? (« 03 » → oui, « 035 » → non) */
function prefixOk(local: string, country: Country): boolean {
  if (!country.prefixes) return true;
  const p = local.slice(0, 3);
  return country.prefixes.some((v) => v.startsWith(p));
}

/** Pays et chiffres locaux d'une valeur : l'indicatif prime s'il est présent, sinon `fallback` (pays sélectionné) */
function resolve(value: string | null | undefined, fallback: Country): { country: Country; local: string } | 'country' {
  const s = String(value ?? '');
  let country = fallback;
  if (isInternational(s)) {
    const found = detectCountry(s);
    if (!found) return 'country';
    country = found;
  }
  return { country, local: toLocalDigits(s, false, country) };
}

/**
 * null = valide (ou vide). `country` : indicatif inconnu ; `operator` : préfixe d'opérateur refusé (Madagascar),
 * détecté dès les premiers chiffres ; `length` : numéro incomplet ou trop long.
 * `country` (2e argument) sert pour une saisie locale ; une valeur internationale (« +33… ») porte son propre pays.
 */
export function phoneIssue(value: string | null | undefined, fallback: Country = DEFAULT_COUNTRY): PhoneIssue | null {
  const r = resolve(value, fallback);
  if (r === 'country') return 'country';
  const { country, local } = r;
  if (!local) return isInternational(String(value ?? '')) ? 'length' : null; // « +261 » seul : indicatif sans numéro
  if (!prefixOk(local, country)) return 'operator';
  return local.length === localLength(country) ? null : 'length';
}

/** Forme canonique stockée en base (ex. « +261341234567 »), ou null si le numéro est invalide. Utilisée par le mock ; à reproduire côté API Python. */
export function toE164(raw: string | null | undefined, fallback: Country = DEFAULT_COUNTRY): string | null {
  const s = String(raw ?? '');
  if (/[^\d\s+().\-]/.test(s)) return null;
  const r = resolve(s, fallback);
  if (r === 'country' || !r.local || phoneIssue(s, fallback) !== null) return null;
  return '+' + r.country.dial + r.local.slice(r.country.trunk.length);
}

/**
 * Valeur d'un champ en cours de saisie : numéro canonique si valide, sinon « +indicatif + chiffres saisis » pour qu'il reste reconnu
 * comme invalide quel que soit le pays (un numéro incomplet n'est jamais pris pour un numéro d'un autre pays), '' si vide.
 */
export function toDraftValue(local: string, country: Country): string {
  if (!local) return '';
  if (local.startsWith('00')) return local; // indicatif inconnu
  return toE164(local, country) ?? '+' + country.dial + local.slice(country.trunk.length);
}

/** Affichage : « +261341234567 » (ou ancien format libre) → « 034 12 345 67 » ; autre pays → « +33 6 12 34 56 78 » ; valeur non reconnue renvoyée telle quelle */
export function formatPhone(value: string | null | undefined): string {
  const r = resolve(value, DEFAULT_COUNTRY);
  if (r === 'country' || !r.local || phoneIssue(value) !== null) return value ?? '';
  return r.country === DEFAULT_COUNTRY ? formatLocal(r.local, r.country) : `+${r.country.dial} ${formatNational(r.local, r.country)}`;
}
