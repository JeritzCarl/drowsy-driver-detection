import { Injectable } from '@angular/core';
import { AlertController, Platform } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { NativeAudio } from '@awesome-cordova-plugins/native-audio/ngx';
import { Media, MediaObject } from '@awesome-cordova-plugins/media/ngx';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class AlertService {
  // ── Current sound + engines ────────────────────────────────────────────────
  private currentSound: string = 'assets/alert.mp3'; // default packaged asset
  private htmlAudio?: HTMLAudioElement;               // browser / generic fallback
  private mediaFile?: MediaObject;                    // for content:// | file:// picked files
  private readonly nativeAudioId = 'alertSound';      // NativeAudio single logical channel

  // ── Loop state ─────────────────────────────────────────────
  private isLooping = false;
  private loopTimer?: any;

  constructor(
    private alertCtrl: AlertController,
    private platform: Platform,
    private nativeAudio: NativeAudio,
    private media: Media
  ) {
    const saved = localStorage.getItem('alertSound');
    this.currentSound = saved || 'assets/alert.mp3';
    this.loadSound(this.currentSound);
    this.unlockAudioForBrowser();
  }

  // ===================================================================
  // Permissions
  // ===================================================================
  async requestPermissions() {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.vibrate({ duration: 50 });
      } catch {}
    }
  }

  // ===================================================================
  // Loading / Switching Sounds
  // ===================================================================
  async loadSound(path: string) {
    this.currentSound = path;
    localStorage.setItem('alertSound', path);

    try {
      this.htmlAudio = new Audio(path);
      this.htmlAudio.preload = 'auto';
      this.htmlAudio.loop = false;
      await this.htmlAudio.load?.();
    } catch {}

    if (!Capacitor.isNativePlatform()) return;

    try {
      if (this.mediaFile) {
        this.mediaFile.release();
        this.mediaFile = undefined;
      }
      await this.nativeAudio.unload(this.nativeAudioId).catch(() => {});

      if (this.isPackagedAsset(path)) {
        const assetUrl = this.toNativeAssetPath(path);
        await this.nativeAudio.preloadSimple(this.nativeAudioId, assetUrl);
      } else {
        this.mediaFile = this.media.create(path);
      }
    } catch (err) {
      console.warn('[AlertService] loadSound failed:', err);
    }
  }

  // ===================================================================
  // Browser Autoplay Unlock
  // ===================================================================
  private unlockAudioForBrowser() {
    const unlock = () => {
      if (!this.htmlAudio) return;
      this.htmlAudio
        .play()
        .then(() => {
          this.htmlAudio!.pause();
          this.htmlAudio!.currentTime = 0;
        })
        .catch(() => {});
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }

  // ===================================================================
  // Looping Alerts
  // ===================================================================
  async startLoopingAlert(sound = true, vibration = true) {
    if (this.isLooping) return;
    this.isLooping = true;

    const canNativeLoop =
      Capacitor.isNativePlatform() && this.isPackagedAsset(this.currentSound);

    if (sound && canNativeLoop) {
      try {
        await this.loadSound(this.currentSound);
        await this.nativeAudio.loop(this.nativeAudioId);
        if (vibration) {
          this.scheduleVibrationTick([400, 200, 400], ImpactStyle.Heavy);
        }
        return;
      } catch {}
    }

    this.loopTick(sound, vibration);
  }

  stopLoopingAlert() {
    this.isLooping = false;

    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = undefined;
    }

    if (Capacitor.isNativePlatform()) {
      this.nativeAudio.stop(this.nativeAudioId).catch(() => {});
    }

    try {
      this.mediaFile?.stop();
    } catch {}

    if (this.htmlAudio) {
      try {
        this.htmlAudio.pause();
        this.htmlAudio.currentTime = 0;
        this.htmlAudio.loop = false;
      } catch {}
    }
  }

  private loopTick(sound: boolean, vibration: boolean) {
    const tick = async () => {
      if (!this.isLooping) return;
      await this.playAlert([400, 200, 400], ImpactStyle.Heavy, sound, vibration);
      this.loopTimer = setTimeout(tick, 2500);
    };
    tick();
  }

  private scheduleVibrationTick(vibrationPattern: number[], impact: ImpactStyle) {
    const vibTick = async () => {
      if (!this.isLooping) return;
      try {
        if (Capacitor.isNativePlatform()) {
          await Haptics.vibrate({ duration: 600 });
        } else if ('vibrate' in navigator) {
          navigator.vibrate(vibrationPattern);
        }
      } catch {}
      this.loopTimer = setTimeout(vibTick, 2500);
    };
    vibTick();
  }

  // ===================================================================
  // One-shot Alerts
  // ===================================================================
  private async playAlert(
    vibrationPattern: number[],
    impact: ImpactStyle = ImpactStyle.Heavy,
    sound = true,
    vibration = true
  ) {
    try {
      if (sound) {
        if (Capacitor.isNativePlatform()) {
          if (this.mediaFile) {
            try {
              this.mediaFile.stop();
            } catch {}
            this.mediaFile.play();
          } else if (this.isPackagedAsset(this.currentSound)) {
            await this.nativeAudio.play(this.nativeAudioId).catch(() => {
              if (this.htmlAudio) {
                this.htmlAudio.currentTime = 0;
                this.htmlAudio.play().catch(() => {});
              }
            });
          } else if (this.htmlAudio) {
            this.htmlAudio.currentTime = 0;
            await this.htmlAudio.play().catch(() => {});
          }
        } else if (this.htmlAudio) {
          this.htmlAudio.currentTime = 0;
          await this.htmlAudio.play().catch(() => {});
        }
      }

      if (vibration) {
        if (Capacitor.isNativePlatform()) {
          await Haptics.vibrate({ duration: 600 });
        } else if ('vibrate' in navigator) {
          navigator.vibrate(vibrationPattern);
        }
      }
    } catch (err) {
      console.warn('[AlertService] playAlert error:', err);
    }
  }

  async triggerWarningAlert(sound = true, vibration = true) {
    await this.playAlert([150, 75, 150], ImpactStyle.Medium, sound, vibration);
  }

  async triggerCriticalAlert(sound = true, vibration = true) {
    await this.playAlert([250, 150, 250, 150, 350], ImpactStyle.Heavy, sound, vibration);
  }

  async vibrate(sound = true, vibration = true) {
    await this.playAlert([200, 100, 200], ImpactStyle.Light, sound, vibration);
  }

  // ===================================================================
  // Popup
  // ===================================================================
  async showAlert(header: string, message: string) {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  // ===================================================================
  // Helpers
  // ===================================================================
  private isPackagedAsset(path: string): boolean {
    if (!path) return false;
    if (/^(file|content|data|https?):/i.test(path)) return false;
    return true;
  }

  private toNativeAssetPath(path: string): string {
    return `file:///android_asset/public/${path.replace(/^\/+/, '')}`;
  }
}
