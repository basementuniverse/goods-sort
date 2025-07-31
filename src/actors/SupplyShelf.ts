import Camera from '@basementuniverse/camera';
import { AABB } from '@basementuniverse/intersection-helpers/2d';
import { isVec2 } from '@basementuniverse/intersection-helpers/utilities';
import { vec2 } from '@basementuniverse/vec';
import { Product, Shelf } from '.';
import Level from '../Level';
import {
  AbstractShelfData,
  isAbstractShelfData,
  ShelfFactory,
} from '../ShelfFactory';

export type SupplyShelfData = {
  shelf: AbstractShelfData<
    'shelf' | 'deep-shelf' | 'disappearing-shelf' | 'locking-shelf'
  >;
  offset?: vec2;
};

export function isSupplyShelfData(data: any): data is SupplyShelfData {
  return (
    typeof data === 'object' &&
    isAbstractShelfData(data.shelf, [
      'shelf',
      'deep-shelf',
      'disappearing-shelf',
      'locking-shelf',
    ]) &&
    (data.offset === undefined || isVec2(data.offset))
  );
}

/**
 * Supply shelf can only have products removed from it
 */
export class SupplyShelf extends Shelf {
  public constructor(
    level: Level,
    public shelf: Shelf,
    public offset: vec2 = vec2()
  ) {
    shelf.canDropProductAtIndex = (
      _product: Product,
      _index: number
    ): boolean => false;
    super(level, [], offset, undefined, undefined, true, undefined, false);
  }

  public static fromData(level: Level, data: any): SupplyShelf {
    if (!isSupplyShelfData(data)) {
      throw new Error('Invalid supply shelf data');
    }
    const shelf = ShelfFactory.createShelf(level, data.shelf);
    return new SupplyShelf(level, shelf, data.offset || vec2());
  }

  public update(dt: number, level: Level, camera: Camera) {
    this.shelf.position = this.position;
    this.shelf.update(dt, level, camera);
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
    this.shelf.draw(context);
  }
}
