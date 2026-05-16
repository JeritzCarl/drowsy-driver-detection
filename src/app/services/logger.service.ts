import { Injectable } from '@angular/core';

export interface EventLog {
  time: string; // ISO timestamp or localized string
  level: 'warning' | 'critical' | 'info';
  score: number; // 0–100
  reason?: string; // contextual reason (e.g. “Eyes closed too long”)
  detail?: string; // fallback descriptive message
}

@Injectable({ providedIn: 'root' })
export class LoggerService {
  private logs: EventLog[] = [];

  constructor() {
    // ✅ clear logs every new session (no stale entries)
    sessionStorage.removeItem('logs');
  }

  log(entry: EventLog) {
    const normalized: EventLog = {
      time: entry.time ?? new Date().toISOString(),
      level: entry.level,
      score: Math.max(0, Math.min(100, entry.score ?? 0)),
      reason: entry.reason ?? '',
      detail:
        entry.detail ??
        entry.reason ??
        `Risk=${Math.round(entry.score ?? 0)}%`,
    };

    this.logs.unshift(normalized);
    sessionStorage.setItem('logs', JSON.stringify(this.logs));
  }

  getLogs(): EventLog[] {
    const data = sessionStorage.getItem('logs');
    this.logs = data ? JSON.parse(data) : [];
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    sessionStorage.removeItem('logs');
  }
}
