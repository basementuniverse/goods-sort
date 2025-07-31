import Game from './Game';

window.onload = () => {
  const game = new Game(document.querySelector('#game'));
  game.initialise();
};
