import { JSDOM } from 'jsdom';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
await act(async () => { createRoot(document.getElementById('root')!).render(React.createElement(App)); });
const text = document.body.textContent?.trim() ?? '';
if (!text.includes('Jouer le niveau')) throw new Error('Écran d’accueil introuvable');
console.log('UI smoke PASS — écran d’accueil rendu');
