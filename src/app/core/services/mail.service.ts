import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Attachment, BulkAction, ComposePayload, Folder, FolderCounts, MailDetail, MailSummary, Page } from '../models';

export interface MailQuery {
  folder: Folder;
  q?: string;
  unread?: boolean;
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class MailService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/mails`;

  /** Compteurs affichés dans la barre latérale */
  readonly counts = signal<FolderCounts | null>(null);

  list(query: MailQuery): Observable<Page<MailSummary>> {
    let params = new HttpParams()
      .set('folder', query.folder)
      .set('page', query.page ?? 1)
      .set('pageSize', query.pageSize ?? 20);
    if (query.q) params = params.set('q', query.q);
    if (query.unread) params = params.set('unread', true);
    return this.http.get<Page<MailSummary>>(this.api, { params });
  }

  get(id: number): Observable<MailDetail> {
    return this.http.get<MailDetail>(`${this.api}/${id}`).pipe(tap(() => this.refreshCounts()));
  }

  /** Envoie (ou enregistre en brouillon si `payload.draft`) ; `draftId` met à jour un brouillon existant */
  send(payload: ComposePayload, draftId?: number | null): Observable<MailDetail> {
    const req = draftId
      ? this.http.put<MailDetail>(`${this.api}/${draftId}`, payload)
      : this.http.post<MailDetail>(this.api, payload);
    return req.pipe(tap(() => this.refreshCounts()));
  }

  update(id: number, patch: Partial<Pick<MailSummary, 'read' | 'starred' | 'folder'>>): Observable<MailSummary> {
    return this.http.patch<MailSummary>(`${this.api}/${id}`, patch).pipe(tap(() => this.refreshCounts()));
  }

  bulk(ids: number[], action: BulkAction): Observable<void> {
    return this.http.post<void>(`${this.api}/bulk`, { ids, action }).pipe(tap(() => this.refreshCounts()));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}`).pipe(tap(() => this.refreshCounts()));
  }

  upload(file: File): Observable<Attachment> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<Attachment>(`${this.api}/attachments`, form);
  }

  /** Récupère le contenu d'une pièce jointe (GET /mails/attachments/:id, flux authentifié par JWT) */
  fetchAttachment(a: Attachment): Observable<Blob> {
    return this.http.get(`${this.api}/attachments/${a.id}`, { responseType: 'blob' });
  }

  /** Télécharge une pièce jointe et l'enregistre */
  downloadAttachment(a: Attachment): Observable<Blob> {
    return this.fetchAttachment(a).pipe(tap((blob) => this.saveBlob(blob, a.fileName)));
  }

  /** Enregistre un Blob déjà en mémoire sous le nom donné */
  saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  refreshCounts(): void {
    this.http.get<FolderCounts>(`${this.api}/counts`).subscribe((c) => this.counts.set(c));
  }
}
