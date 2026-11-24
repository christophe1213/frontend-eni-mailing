import { Attachment } from '../core/models';

export type PreviewKind = 'pdf' | 'image' | 'text';

export interface PreviewInfo {
  kind: PreviewKind;
  /** Type MIME « sûr » avec lequel le contenu sera affiché (jamais celui annoncé par le serveur) */
  mime: string;
}

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp']);
const TEXT_MIMES = new Set(['application/json', 'application/xml', 'application/x-ndjson']);

/** Repli sur l'extension quand le serveur envoie un type générique */
const BY_EXTENSION: Record<string, PreviewInfo> = {
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  png: { kind: 'image', mime: 'image/png' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  gif: { kind: 'image', mime: 'image/gif' },
  webp: { kind: 'image', mime: 'image/webp' },
  bmp: { kind: 'image', mime: 'image/bmp' },
  txt: { kind: 'text', mime: 'text/plain' },
  md: { kind: 'text', mime: 'text/plain' },
  csv: { kind: 'text', mime: 'text/plain' },
  log: { kind: 'text', mime: 'text/plain' },
  json: { kind: 'text', mime: 'text/plain' },
  xml: { kind: 'text', mime: 'text/plain' },
};

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i > 0 ? fileName.slice(i + 1).toLowerCase() : '';
}

/**
 * Indique si (et comment) une pièce jointe peut être prévisualisée : PDF, images raster, texte.
 * Renvoie `null` pour tout le reste (SVG et HTML inclus : ils peuvent embarquer du script) → repli « Télécharger ».
 */
export function previewInfo(a: Pick<Attachment, 'fileName' | 'mimeType'>): PreviewInfo | null {
  const mime = (a.mimeType ?? '').split(';')[0].trim().toLowerCase();
  if (mime === 'application/pdf') return { kind: 'pdf', mime };
  if (IMAGE_MIMES.has(mime)) return { kind: 'image', mime };
  if (mime === 'text/html' || mime === 'image/svg+xml') return null;
  if (mime.startsWith('text/') || TEXT_MIMES.has(mime)) return { kind: 'text', mime: 'text/plain' };
  if (mime === '' || mime === 'application/octet-stream') return BY_EXTENSION[extensionOf(a.fileName)] ?? null;
  return null;
}

/** Libellé lisible du type de fichier */
export function typeLabel(a: Pick<Attachment, 'fileName' | 'mimeType'>): string {
  const ext = extensionOf(a.fileName).toUpperCase();
  switch (previewInfo(a)?.kind) {
    case 'pdf': return 'Document PDF';
    case 'image': return ext ? `Image ${ext}` : 'Image';
    case 'text': return 'Texte';
    default: return ext ? `Fichier ${ext}` : 'Fichier';
  }
}
