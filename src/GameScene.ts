import Camera from '@basementuniverse/camera';
import ContentManager from '@basementuniverse/content-manager';
import InputManager from '@basementuniverse/input-manager';
import SceneManager, {
  Scene,
  SceneTransitionState,
} from '@basementuniverse/scene-manager';
import { vec2 } from '@basementuniverse/vec';
import Game from './Game';
import Level from './Level';

export class GameScene extends Scene {
  public static readonly SCREEN_WIDTH_PRODUCTS = 12;
  private static readonly TRANSITION_TIME: number = 1;

  private time: number = 0;
  private camera: Camera;
  private level: Level;

  public constructor() {
    super({
      transitionTime: GameScene.TRANSITION_TIME,
    });
  }

  public initialise(levelId: string) {
    this.camera = new Camera(vec2());

    // Load level
    const levelData = ContentManager.get(levelId);
    if (!levelData) {
      throw new Error(`Level data for '${levelId}' not found`);
    }
    this.level = Level.fromData(levelData);
  }

  public update(dt: number) {
    this.time += dt;

    // TEMP: reset the game scene when Escape is pressed
    if (InputManager.keyPressed('Escape')) {
      SceneManager.pop();
      SceneManager.push(new GameScene(), this.level.data.id);
    }

    this.level.update(dt, this.camera);
  }

  public draw(context: CanvasRenderingContext2D) {
    context.save();
    if (this.transitionState !== SceneTransitionState.None) {
      context.globalAlpha = this.transitionAmount;
    }

    // Background
    context.fillStyle = '#ccc';
    context.fillRect(0, 0, Game.screen.x, Game.screen.y);

    context.save();

    // Render level in world-space
    this.camera.draw(context, Game.screen);
    this.level.draw(context, this.camera);

    context.restore();
    context.restore();
  }
}
