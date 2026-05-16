import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AlertService } from './alert.service';
import { LoggerService } from './logger.service';

type Landmark = { x: number; y: number; z?: number };
interface Metrics {
  eyeClosure: number;
  blinkRate: number;
  headPose: number;
  riskScore: number;
}
interface FaceBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  landmarks: Landmark[];
  confidence?: number;
}

@Injectable({ providedIn: 'root' })
export class DetectionService {
  private tf: any;
  private flds: any;
  private detector: any | null = null;
  private video!: HTMLVideoElement;

  private monitoring = false;
  private hud?: HTMLDivElement;
  private fps = 0;
  private lastLoopTime = performance.now();

  private _blinkCount = 0;
  private lastBlinkStart = Date.now();
  private prevEyeDist = 0;
  private consecutiveClosed = 0;
  private lastFace: FaceBox | null = null;

  public metrics$ = new BehaviorSubject<Metrics>({
    eyeClosure: 0,
    blinkRate: 0,
    headPose: 0,
    riskScore: 0,
  });

  // 🔊 Preferences
  private soundEnabled = true;
  private vibrationEnabled = true;
  private alertSound!: HTMLAudioElement; // 🔊 sound player

  constructor(private alert: AlertService, private logger: LoggerService) {}

  setAlertPreferences(sound: boolean, vibration: boolean) {
    this.soundEnabled = sound;
    this.vibrationEnabled = vibration;
  }

  // ── Initialize TensorFlow + Model ────────────────────────────────
  private async ensureModel(): Promise<void> {
    if (!this.tf) {
      await import('@tensorflow/tfjs-core');
      await import('@tensorflow/tfjs-backend-webgl');
      await import('@tensorflow/tfjs-converter');
      this.tf = await import('@tensorflow/tfjs');

      try {
        await this.tf.setBackend('webgl');
        await this.tf.ready();
        console.log('✅ TFJS backend (GPU):', this.tf.getBackend());
      } catch {
        console.warn('⚠️ WebGL backend failed — falling back to CPU');
        await this.tf.setBackend('cpu');
        await this.tf.ready();
      }
    }

    if (!this.flds) {
      this.flds = await import('@tensorflow-models/face-landmarks-detection');
    }

    if (!this.detector) {
      this.detector = await this.flds.createDetector(
        this.flds.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: 'tfjs',
          refineLandmarks: true,
          maxFaces: 1,
          modelType: 'full',
        }
      );
      console.log('✅ FaceMesh detector ready.');
      // 🔊 Load alert sound once model is ready
      this.alertSound = new Audio('assets/sounds/beep.mp3');
      this.alertSound.load();
      console.log('🎧 Alert sound loaded');
    }
  }

  attachVideo(videoEl: HTMLVideoElement) {
    this.video = videoEl;
    this.installHUD();
  }

  async startMonitoring(): Promise<void> {
    if (this.monitoring) return;
    if (!this.video) {
      console.error('❌ No video element attached to DetectionService');
      return;
    }

    await this.ensureModel();

    // 🟢 Ensure video is ready
    if (this.video.readyState < 2) {
      await new Promise((res) => (this.video.onloadeddata = () => res(null)));
    }

    this._blinkCount = 0;
    this.prevEyeDist = 0;
    this.consecutiveClosed = 0;
    this.lastBlinkStart = Date.now();
    this.metrics$.next({ eyeClosure: 0, blinkRate: 0, headPose: 0, riskScore: 0 });

    this.monitoring = true;
    this.updateHUD('🔄 Model Loaded — Detecting…');

    const loop = async () => {
      if (!this.monitoring) return;

      const now = performance.now();
      const dt = now - this.lastLoopTime;
      if (dt > 0) this.fps = 1000 / dt;
      this.lastLoopTime = now;

      const metrics = await this.safeAnalyzeFrame();
      this.metrics$.next(metrics);

if (metrics.riskScore > 80) {
  const reason =
    metrics.eyeClosure > 80
      ? 'Eyes closed too long'
      : metrics.blinkRate < 8
      ? 'Low blink rate detected'
      : metrics.headPose > 30
      ? 'Head tilt detected — possible drowsiness'
      : 'Critical drowsiness detected';

        this.updateHUD(`🚨 ${reason}`);

        // 🔊 Play beep sound only when sound is enabled
        if (this.soundEnabled && this.alertSound) {
          this.alertSound.currentTime = 0; // restart sound if already playing
          this.alertSound.play().catch(() => {});
        }

        if (this.soundEnabled || this.vibrationEnabled) {
          this.alert.triggerCriticalAlert?.(this.soundEnabled, this.vibrationEnabled);
        }

        this.logger.log({
          time: new Date().toISOString(),
          level: 'critical',
          reason,
          score: metrics.riskScore,
        });
      } else if (metrics.riskScore > 60) {
        const reason =
          metrics.eyeClosure > 70
            ? 'Eyes closing frequently'
            : metrics.blinkRate < 10
            ? 'Blink rate dropping'
            : metrics.headPose > 25
            ? 'Head tilting detected'
            : 'Early drowsiness signs detected';

        this.updateHUD(`⚠️ ${reason}`);
        if (this.soundEnabled || this.vibrationEnabled)
          this.alert.triggerWarningAlert?.(this.soundEnabled, this.vibrationEnabled);

        this.logger.log({
          time: new Date().toISOString(),
          level: 'warning',
          reason,
          score: metrics.riskScore,
        });
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  async stopMonitoring(): Promise<void> {
    this.monitoring = false;
    this.updateHUD('🛑 Monitoring Stopped');
  }

  private async safeAnalyzeFrame(): Promise<Metrics> {
    try {
      return await this.analyzeFrame();
    } catch (err) {
      console.warn('⚠️ analyzeFrame error:', err);
      return this.emptyMetrics();
    }
  }

  private async analyzeFrame(): Promise<Metrics> {
    if (!this.video || !this.detector) return this.emptyMetrics();

    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    tempCanvas.width = this.video.videoWidth;
    tempCanvas.height = this.video.videoHeight;
    ctx!.drawImage(this.video, 0, 0, tempCanvas.width, tempCanvas.height);
    const faces = await this.detector.estimateFaces(tempCanvas, {
      flipHorizontal: true,
      staticImageMode: false,
    });

    if (!faces || faces.length === 0) {
      this.lastFace = null;
      this.updateHUD('No face detected');
      return { ...this.emptyMetrics(), riskScore: 0 };
    }

    const f = faces[0] as any;
    const keypoints: Landmark[] =
      f.keypoints?.length || f.keypoints3D?.length
        ? f.keypoints ?? f.keypoints3D
        : [];
    if (!keypoints.length) return this.emptyMetrics();

    const box = f.box ?? {
      xMin: Math.min(...keypoints.map((k) => k.x)),
      xMax: Math.max(...keypoints.map((k) => k.x)),
      yMin: Math.min(...keypoints.map((k) => k.y)),
      yMax: Math.max(...keypoints.map((k) => k.y)),
    };
    const conf = f.faceInViewConfidence ?? f.probability ?? 1.0;
    const { xMin, yMin, xMax, yMax } = box;
    const faceH = Math.max(1, yMax - yMin);
    this.lastFace = { xMin, yMin, xMax, yMax, landmarks: keypoints, confidence: conf };

    // 🧠 Eyes and blink logic
    const LUp = keypoints[159],
      LLo = keypoints[145],
      RUp = keypoints[386],
      RLo = keypoints[374];
    if (!LUp || !LLo || !RUp || !RLo) return this.emptyMetrics();

    const LDist = Math.hypot(LUp.x - LLo.x, LUp.y - LLo.y);
    const RDist = Math.hypot(RUp.x - RLo.x, RUp.y - RLo.y);
    const avgEye = (LDist + RDist) / 2;

    let eyeClosure = (1 - avgEye / (0.065 * faceH)) * 100;
    eyeClosure = Math.round(Math.min(100, Math.max(0, eyeClosure)));

    const BLINK_TH = 0.018 * faceH;
    if (avgEye < BLINK_TH) {
      this.consecutiveClosed++;
    } else {
      if (this.consecutiveClosed > 2 && this.prevEyeDist < BLINK_TH) {
        this._blinkCount++;
        this.lastBlinkStart = Date.now();
      }
      this.consecutiveClosed = 0;
    }
    this.prevEyeDist = avgEye;

    const elapsedMin = Math.max(0.001, (Date.now() - this.lastBlinkStart) / 60000);
    let blinkRate = this._blinkCount / elapsedMin;
    blinkRate = Math.min(60, Math.max(0, Math.round(blinkRate * 10) / 10));

    const nose = keypoints[1],
      LCorner = keypoints[33];
    const headPose = Math.min(45, Math.abs(nose.x - LCorner.x) * 0.25);

    let riskScore = eyeClosure * 0.6 + blinkRate * 0.25 + headPose * 0.15;
    riskScore = Math.round(Math.min(100, Math.max(0, riskScore)));

    this.updateHUD();
    return { eyeClosure, blinkRate, headPose: Math.round(headPose), riskScore };
  }

  private installHUD() {
    if (this.hud) return;
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      top: '8px',
      right: '8px',
      background: 'rgba(0,0,0,0.6)',
      color: '#00FFAA',
      fontSize: '13px',
      fontFamily: 'monospace',
      padding: '6px 8px',
      borderRadius: '6px',
      zIndex: '9999',
      pointerEvents: 'none',
    } as CSSStyleDeclaration);
    el.textContent = 'Initializing…';
    document.body.appendChild(el);
    this.hud = el;
  }

  private updateHUD(status?: string) {
    if (!this.hud) return;
    const conf = this.lastFace?.confidence
      ? (this.lastFace.confidence * 100).toFixed(1)
      : '--';
    const txt =
      status ??
      `FPS: ${this.fps.toFixed(1)} | Conf: ${conf}% | Blinks: ${this._blinkCount}`;
    this.hud.textContent = txt;
  }

  getLastFaceBox(): FaceBox | null {
    return this.lastFace;
  }

  get blinkCount(): number {
    return this._blinkCount;
  }

  private emptyMetrics(): Metrics {
    return { eyeClosure: 0, blinkRate: 0, headPose: 0, riskScore: 0 };
  }
}
