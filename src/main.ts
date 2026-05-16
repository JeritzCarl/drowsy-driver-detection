import { addIcons } from 'ionicons';
import { eyeOutline } from 'ionicons/icons';
addIcons({ 'eye-outline': eyeOutline });

import { bootstrapApplication } from '@angular/platform-browser';
import {
  RouteReuseStrategy,
  provideRouter,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import {
  IonicRouteStrategy,
  provideIonicAngular,
} from '@ionic/angular/standalone';

// ✅ Plugins
import { NativeAudio } from '@awesome-cordova-plugins/native-audio/ngx';
import { Media } from '@awesome-cordova-plugins/media/ngx';
import { Haptics } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

// ✅ Optional haptic check (safe)
if (Capacitor.isNativePlatform()) {
  Haptics.vibrate({ duration: 50 }).catch(() =>
    console.log('⚠️ Haptics not available at startup')
  );
}

// ✅ Bootstrap Application
bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    NativeAudio, // for packaged alert sounds
    Media,       // for playback of picked or stored audio
  ],
});