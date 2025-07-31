import { vec2 } from '@basementuniverse/vec';
import { v4 as uuid } from 'uuid';
import Level from '../Level';

export abstract class Actor {
  public id: string;
  public position: vec2 = vec2();
  public disposed: boolean = false;

  public constructor(protected level: Level) {
    this.id = uuid();
  }

  public abstract update(dt: number, ...args: any[]): void;

  public abstract draw(context: CanvasRenderingContext2D, ...args: any[]): void;
}
