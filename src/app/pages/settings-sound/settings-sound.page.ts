import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { AlertService } from '../../services/alert.service';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { FilePicker } from '@capawesome/capacitor-file-picker';

declare var cordova: any; // ✅ runtime safe access
addIcons({ 'arrow-back-outline': arrowBackOutline });

@Component({
  selector: 'app-settings-sound',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './settings-sound.page.html',
  styleUrls: ['./settings-sound.page.scss'],
})
export class SettingsSoundPage implements OnInit, OnDestroy {
  sounds = [
    { name: 'Default Alarm', path: 'assets/alert.mp3' },
    { name: 'Beep Tone', path: 'assets/sounds/beep.mp3' },
    { name: 'Siren', path: 'assets/sounds/siren.mp3' },
    { name: 'Soft Chime', path: 'assets/sounds/chime.mp3' },
  ];

  selectedPath = '';
  selectedName = 'Default Alarm';

  constructor(
    private alertService: AlertService,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  async ngOnInit() {
    const saved = localStorage.getItem('alertSound');
    const savedName = localStorage.getItem('selectedSoundName');
    this.selectedPath = saved || 'assets/alert.mp3';
    this.selectedName = savedName || 'Default Alarm';
    await this.alertService.loadSound(this.selectedPath);
  }

  ngOnDestroy() {
    this.alertService.stopLoopingAlert();
  }

  /** 🔊 Preview any built-in sound */
  async previewSound(path: string) {
    this.alertService.stopLoopingAlert();
    await this.alertService.loadSound(path);
    await this.alertService.startLoopingAlert(true, false);
    setTimeout(() => this.alertService.stopLoopingAlert(), 2500);
  }

  /** ✅ Choose one of the default sounds */
  async selectSound(path: string) {
    const name = this.sounds.find((s) => s.path === path)?.name || 'Custom Sound';
    this.selectedPath = path;
    this.selectedName = name;
    await this.alertService.loadSound(path);
    localStorage.setItem('alertSound', path);
    localStorage.setItem('selectedSoundName', name);
    await this.showToast(`✅ "${name}" set as alert sound.`);
  }

  /** 🚨 Test current alert */
  async testAlert() {
    await this.alertService.startLoopingAlert(true, true);
    setTimeout(() => this.alertService.stopLoopingAlert(), 5000);
  }

  /** 📂 Pick local MP3/WAV */
  async pickLocalSound() {
    try {
      const result = await FilePicker.pickFiles({ types: ['audio/*'], readData: false });
      if (!result.files?.length) return;

      const file = result.files[0] as any;
      const path = file.path || file.nativeUrl || '';
      if (!path) {
        await this.showToast('❌ Could not access selected file.');
        return;
      }

      await this.alertService.loadSound(path);
      localStorage.setItem('alertSound', path);
      localStorage.setItem('selectedSoundName', file.name || 'Custom Sound');
      this.selectedPath = path;
      this.selectedName = file.name || 'Custom Sound';

      await this.showToast(`✅ "${file.name || 'Custom Sound'}" set as alert sound.`);
    } catch (err) {
      console.warn('⚠️ File pick cancelled or failed:', err);
      await this.showToast('⚠️ No sound selected.');
    }
  }

  /** 🔔 Optional ringtone picker — runs only if plugin exists */
  async pickSystemRingtone() {
    try {
      if (typeof cordova === 'undefined' || !cordova.plugins?.ringtones) {
        await this.showToast('⚠️ Ringtone plugin not detected.');
        return;
      }

      const ringtone = await cordova.plugins.ringtones.getRingtone({ type: 'alarm' });
      if (!ringtone || !ringtone.url) {
        await this.showToast('❌ No ringtone selected.');
        return;
      }

      const path = ringtone.url;
      const name = ringtone.name || 'System Sound';
      localStorage.setItem('alertSound', path);
      localStorage.setItem('selectedSoundName', name);
      this.selectedPath = path;
      this.selectedName = name;
      await this.alertService.loadSound(path);
      await this.showToast(`✅ "${name}" set as alert sound.`);
    } catch (err) {
      console.warn('⚠️ Ringtone picker failed:', err);
      await this.showToast('⚠️ Could not open ringtone picker.');
      await this.alertService.loadSound('assets/alert.mp3');
    }
  }

  goBack() {
    this.router.navigate(['/home']);
  }

  /** 🍞 Toast helper */
  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 1800,
      position: 'bottom',
    });
    await toast.present();
  }
}
