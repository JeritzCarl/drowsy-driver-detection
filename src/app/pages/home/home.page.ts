import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { IonicModule, ToastController, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { LoggerService, EventLog } from '../../services/logger.service';
import { AlertService } from '../../services/alert.service';
import { DetectionService } from '../../services/detection.service';
import { StatsService } from '../../services/stats.service';
import { Subscription, interval } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('video', { static: false }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('overlay', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  isMonitoring = false;
  status = 'Safe';
  score = 0;
  logs: EventLog[] = [];
  stats = { total: 0, warning: 0, critical: 0 };

  sessionSummaryVisible = false;
  sessionDuration = '0m 0s';
  averageBlinkRate = 0;
  averageRisk = 0;
  totalAlerts = 0;
  soundEnabled = true;
  vibrationEnabled = true;
  selectedSoundName = 'Default Alarm'; // ✅ sound name display

  private startTime = 0;
  private durationTimer?: Subscription;
  private stream: MediaStream | null = null;
  private metricsSub?: Subscription;
  private ctx?: CanvasRenderingContext2D;
  private lastLogUpdate = 0; // ✅ added to throttle UI refresh

  constructor(
    private logger: LoggerService,
    private alert: AlertService,
    private statsService: StatsService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    public detection: DetectionService,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.alert.requestPermissions?.();
    this.refreshLogs();
    this.loadSelectedSound();

    this.metricsSub = this.detection.metrics$.subscribe((m) => {
      this.score = m.riskScore;
      this.stats.total++;

      if (m.riskScore > 80) {
        this.status = 'Critical';
        this.stats.critical++;
        this.totalAlerts++;
        this.logger.log({
          time: new Date().toLocaleString(),
          level: 'critical',
          score: m.riskScore,
          detail: 'Prolonged eye closure or head tilt detected',
        });
      } else if (m.riskScore > 60) {
        this.status = 'Warning';
        this.stats.warning++;
        this.totalAlerts++;
        this.logger.log({
          time: new Date().toLocaleString(),
          level: 'warning',
          score: m.riskScore,
          detail: 'Increased blink rate or mild fatigue signs',
        });
      } else {
        this.status = 'Safe';
      }

      // ✅ Throttle Recent Events updates to once per second
      const now = Date.now();
      if (now - this.lastLogUpdate > 1000) {
        this.refreshLogs();
        this.lastLogUpdate = now;
      }
    });
  }

  ionViewWillEnter() {
    this.loadSelectedSound(); // ✅ refresh sound when returning from settings
  }

  ngAfterViewInit() {}
  ngOnDestroy() {
    this.stopMonitoring();
    this.metricsSub?.unsubscribe();
    this.durationTimer?.unsubscribe();
  }

  private loadSelectedSound() {
    const saved = localStorage.getItem('selectedSoundName');
    if (saved) this.selectedSoundName = saved;
  }

  private async initCamera(): Promise<MediaStream | null> {
    try {
      const constraints = {
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (err) {
      console.error('Camera init error:', err);
      await this.showAlert(
        'Camera Access Denied',
        'Please allow camera access in your app permissions.'
      );
      return null;
    }
  }

  async startMonitoring() {
    if (this.isMonitoring) return;

    this.sessionSummaryVisible = false;
    this.startTime = Date.now();
    this.totalAlerts = 0;
    this.averageBlinkRate = 0;
    this.averageRisk = 0;
    this.sessionDuration = '0m 0s';

    this.isMonitoring = true;
    this.status = 'Safe';
    this.logger.clearLogs();
    this.refreshLogs();
    this.showToast('Starting camera...');

    this.durationTimer = interval(1000).subscribe(() => this.updateDuration());

    const stream = await this.initCamera();
    if (!stream) {
      this.isMonitoring = false;
      return;
    }

    this.stream = stream;
    const video = this.videoRef.nativeElement;
    video.srcObject = stream;
    await video.play().catch(() => (this.isMonitoring = false));

    await new Promise<void>((resolve) => {
      const waitForFrame = () => {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w > 0 && h > 0 && video.readyState >= 2) resolve();
        else requestAnimationFrame(waitForFrame);
      };
      waitForFrame();
    });

    const canvas = this.canvasRef.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    this.ctx = canvas.getContext('2d')!;

    this.detection.attachVideo(video);
    this.detection.setAlertPreferences(this.soundEnabled, this.vibrationEnabled);
    await this.detection.startMonitoring();

    this.showToast('Monitoring started.');
    this.drawLoop();
  }

  async stopMonitoring() {
    if (!this.isMonitoring) return;
    this.isMonitoring = false;
    await this.detection.stopMonitoring();
    this.durationTimer?.unsubscribe();

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    this.updateDuration();
    const metrics = this.detection.metrics$.value;
    this.averageBlinkRate = metrics.blinkRate;
    this.averageRisk = metrics.riskScore;
    this.totalAlerts = this.stats.warning + this.stats.critical;
    this.sessionSummaryVisible = true;
    this.detection.setAlertPreferences(this.soundEnabled, this.vibrationEnabled);

    this.showToast('Monitoring stopped.');
  }

  private updateDuration() {
    const elapsedMs = Date.now() - this.startTime;
    const totalSecs = Math.max(0, Math.floor(elapsedMs / 1000));
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    this.sessionDuration = hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : `${mins}m ${secs}s`;
  }

  private drawLoop() {
    if (!this.isMonitoring || !this.ctx) return;

    const canvas = this.canvasRef.nativeElement;
    const ctx = this.ctx;
    const box = this.detection.getLastFaceBox?.();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (box) {
      const { xMin, yMin, xMax, yMax, landmarks } = box;
      ctx.strokeStyle = '#00FF88';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(xMin, yMin, xMax - xMin, yMax - yMin);
      ctx.fillStyle = '#ff5555';
      for (const pt of landmarks) ctx.fillRect(pt.x - 2, pt.y - 2, 3.5, 3.5);
    }

    requestAnimationFrame(() => this.drawLoop());
  }

  refreshLogs() {
    this.logs = this.logger.getLogs();
  }

  openSoundSettings() {
    this.router.navigate(['/settings-sound']);
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 1800,
      position: 'bottom',
    });
    await toast.present();
  }

  private async showAlert(header: string, message: string) {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }
}
