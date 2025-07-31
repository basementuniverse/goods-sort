import Camera from '@basementuniverse/camera';
import { AABB } from '@basementuniverse/intersection-helpers/2d';
import { isVec2 } from '@basementuniverse/intersection-helpers/utilities';
import { clamp, remap } from '@basementuniverse/utils';
import { vec2 } from '@basementuniverse/vec';
import Level from '../Level';
import {
  AbstractShelfData,
  isAbstractShelfData,
  ShelfFactory,
} from '../ShelfFactory';
import { Product } from './Product';
import { Shelf } from './Shelf';

export type DisappearingShelfData = {
  shelf: AbstractShelfData<
    'shelf' | 'deep-shelf' | 'display-shelf' | 'locking-shelf' | 'supply-shelf'
  >;
  offset?: vec2;
};

export function isDisappearingShelfData(
  data: any
): data is DisappearingShelfData {
  return (
    typeof data === 'object' &&
    isAbstractShelfData(data.shelf, [
      'shelf',
      'deep-shelf',
      'display-shelf',
      'locking-shelf',
      'supply-shelf',
    ]) &&
    (data.offset === undefined || isVec2(data.offset))
  );
}

/**
 * Disappearing shelf disappears when completed
 */
export class DisappearingShelf extends Shelf {
  private static readonly DISAPPEARING_ANIMATION_TIME: number = 0.5;
  private static readonly DISAPPEARING_ANIMATION_SCALE_AMOUNT: number = 1.1;
  private static readonly DISAPPEARING_ANIMATION_GROW_TIME: number = 0.2;

  private disappearing: boolean = false;
  private disappearingTime: number = 0;

  public constructor(
    level: Level,
    public shelf: Shelf,
    public offset: vec2 = vec2()
  ) {
    super(level, [], offset, undefined, undefined, true, undefined, false);
  }

  public static fromData(level: Level, data: any): DisappearingShelf {
    if (!isDisappearingShelfData(data)) {
      throw new Error('Invalid disappearing shelf data');
    }
    const shelf = ShelfFactory.createShelf(level, data.shelf);
    return new DisappearingShelf(level, shelf, data.offset || vec2());
  }

  public update(dt: number, level: Level, camera: Camera) {
    this.shelf.position = this.position;
    this.shelf.update(dt, level, camera);

    if (this.shelfIsComplete() && !this.disappearing) {
      this.disappearing = true;
      this.disappearingTime = DisappearingShelf.DISAPPEARING_ANIMATION_TIME;

      // Update stats
      level.stats.totalCompletedShelves++;
    }

    // Handle disappearing animation
    if (this.disappearing) {
      this.disappearingTime = clamp(
        this.disappearingTime - dt,
        0,
        DisappearingShelf.DISAPPEARING_ANIMATION_TIME
      );
      if (this.disappearingTime <= 0) {
        this.shelf.disposed = true;
        this.disposed = true;
      }
    }
  }

  public findShelfSlot(_product: Product): {
    valid: boolean;
  } {
    return { valid: false };
  }

  public canPickUpProductAtIndex(_product: Product, _index: number): boolean {
    return false;
  }

  public canDropProductAtIndex(_product: Product, _index: number): boolean {
    return false;
  }

  public shelfIsEmpty(): boolean {
    return true;
  }

  public shelfIsComplete(): boolean {
    return this.shelf.shelfIsComplete();
  }

  public getAABB(index?: number): AABB {
    return this.shelf.getAABB(index);
  }

  public draw(context: CanvasRenderingContext2D) {
    const halfSize = vec2.scale(this.calculateSize(), 0.5);
    if (this.disappearing) {
      context.save();
      context.translate(
        this.position.x + halfSize.x,
        this.position.y + halfSize.y
      );
      let scale;
      if (
        this.disappearingTime >=
        DisappearingShelf.DISAPPEARING_ANIMATION_TIME -
          DisappearingShelf.DISAPPEARING_ANIMATION_GROW_TIME
      ) {
        scale = remap(
          this.disappearingTime,
          DisappearingShelf.DISAPPEARING_ANIMATION_TIME,
          DisappearingShelf.DISAPPEARING_ANIMATION_TIME -
            DisappearingShelf.DISAPPEARING_ANIMATION_GROW_TIME,
          1,
          DisappearingShelf.DISAPPEARING_ANIMATION_SCALE_AMOUNT
        );
      } else {
        scale = remap(
          this.disappearingTime,
          DisappearingShelf.DISAPPEARING_ANIMATION_TIME -
            DisappearingShelf.DISAPPEARING_ANIMATION_GROW_TIME,
          0,
          DisappearingShelf.DISAPPEARING_ANIMATION_SCALE_AMOUNT,
          0
        );
      }
      context.scale(scale, scale);
      context.translate(
        -this.position.x - halfSize.x,
        -this.position.y - halfSize.y
      );
      this.shelf.draw(context);
      context.restore();
    } else {
      this.shelf.draw(context);
    }
  }
}
