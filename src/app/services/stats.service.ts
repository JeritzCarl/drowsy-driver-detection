import { Injectable } from '@angular/core';
import { LoggerService } from './logger.service';

@Injectable({ providedIn: 'root' })
export class StatsService {
  constructor(private logger: LoggerService) {}

  getSummary() {
    const logs = this.logger.getLogs();
    const total = logs.length;
    const critical = logs.filter(l => l.level === 'critical').length;
    const warning = logs.filter(l => l.level === 'warning').length;
    const normal = total - critical - warning;
    return { total, critical, warning, normal };
  }
}
