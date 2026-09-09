
import { Game } from './game/game.js';
const container = document.getElementById('app');
const game = new Game(container);
game.start().catch((err) => {
    console.error('Failed to start game:', err);
    const label = document.getElementById('loading-label');
    if (label)
        label.textContent = 'Failed to load: ' + (err?.message ?? err);
});

/* Prüfhaken: die anderen Spiele auf der Seite haben denselben. Damit kann
   der Rechner das Spiel selbst bedienen und nachsehen, ob es stimmt. */
window.__bloxrot = game;
