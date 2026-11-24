import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MailTemplate, TemplatePayload } from '../models';

@Injectable({ providedIn: 'root' })
export class TemplateService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/templates`;

  list(): Observable<MailTemplate[]> {
    return this.http.get<MailTemplate[]>(this.api);
  }

  get(id: number): Observable<MailTemplate> {
    return this.http.get<MailTemplate>(`${this.api}/${id}`);
  }

  create(payload: TemplatePayload): Observable<MailTemplate> {
    return this.http.post<MailTemplate>(this.api, payload);
  }

  update(id: number, payload: TemplatePayload): Observable<MailTemplate> {
    return this.http.put<MailTemplate>(`${this.api}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}`);
  }
}

/** Extrait les variables `{{nom}}` d'un modèle */
export function templateVariables(t: Pick<MailTemplate, 'subject' | 'body'>): string[] {
  const found = `${t.subject}\n${t.body}`.match(/\{\{\s*\w+\s*\}\}/g) ?? [];
  return [...new Set(found.map((v) => v.replace(/[{}\s]/g, '')))];
}

/** Remplace les variables par leurs valeurs (les variables vides restent visibles) */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => values[k] || m);
}
