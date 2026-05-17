import { Game } from './game.js';

// Wait for DOM ready
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game(document.getElementById('game-canvas'));
  game.init().catch((err) => {
    console.error('Failed to start game:', err);
    document.getElementById('loading-screen').innerHTML =
      `<div class="loading-inner"><h1>Failed to load</h1><p class="subtitle">${err.message}</p></div>`;
  });

  // expose for debugging
  window.__game = game;
});
