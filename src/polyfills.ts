/**
 * ✅ Angular + Ionic Polyfills with TensorFlowJS Browser Fixes
 * This file includes polyfills needed by Angular and TensorFlowJS for browser/mobile environments.
 */

/***************************************************************************************************
 * 🌐 BROWSER POLYFILLS
 */

import { Buffer } from 'buffer';
import process from 'process';

// 🔧 Fix Node globals for browser builds (safe for Angular + TensorFlowJS)
(window as any).global = window;
(window as any).process = process;
(window as any).Buffer = Buffer;

/**
 * By default, zone.js will patch all possible macroTask and DomEvents.
 * You can disable parts of macroTask/DomEvents patch by setting flags before importing ZoneJS.
 */
import './zone-flags';

/***************************************************************************************************
 * ⚙️ Zone JS (required for Angular)
 */
import 'zone.js'; // Included with Angular CLI.

/***************************************************************************************************
 * 📦 APPLICATION IMPORTS
 * You can import any browser polyfills or libraries here.
 */
