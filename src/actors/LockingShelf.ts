import Camera from '@basementuniverse/camera';
import { rectangle, StyleOptions } from '@basementuniverse/canvas-helpers';
import { AABB } from '@basementuniverse/intersection-helpers/2d';
import { isVec2 } from '@basementuniverse/intersection-helpers/utilities';
import { clamp, remap } from '@basementuniverse/utils';
import { vec2 } from '@basementuniverse/vec';
import Level from '../Level';
import { ProductFactory } from '../ProductFactory';
import {
  AbstractShelfData,
  isAbstractShelfData,
  ShelfFactory,
} from '../ShelfFactory';
import { Product } from './Product';
import { Shelf } from './Shelf';

export type LockingModeData =
  | {
      mode: 'toggle-timer';
      time: number;
      initiallyLocked: boolean;
      finalCountdownUnlock?: number;
    }
  | {
      mode: 'countdown-timer';
      time: number;
    }
  | {
      mode: 'match-products';
      product?: string;
      n: number;
    }
  | {
      mode: 'complete-shelves';
      n: number;
    }
  | {
      mode: 'complete-shelf';
      shelfReference: number;
    }
  | {
      mode: 'place-product';
      shelfReference: string;
      slot: number;
      latch?: boolean;
      inverted?: boolean;
      product?: string;
    };

export type LockingMode = LockingModeData & {
  product?: Product;
};

export function isLockingModeData(data: any): data is LockingModeData {
  if (typeof data !== 'object' || !data.mode) {
    return false;
  }
  switch (data.mode) {
    case 'toggle-timer':
      return (
        typeof data.time === 'number' &&
        typeof data.initiallyLocked === 'boolean' &&
        (data.finalCountdownUnlock === undefined ||
          typeof data.finalCountdownUnlock === 'number')
      );

    case 'countdown-timer':
      return typeof data.time === 'number';

    case 'match-products':
      return typeof data.product === 'string' && typeof data.n === 'number';

    case 'complete-shelves':
      return typeof data.n === 'number';

    case 'complete-shelf':
      return typeof data.shelfIndex === 'number';

    case 'place-product':
      return (
        typeof data.shelfIndex === 'number' &&
        typeof data.slotIndex === 'number' &&
        (data.latch === undefined || typeof data.latch === 'boolean') &&
        (data.inverted === undefined || typeof data.inverted === 'boolean') &&
        (data.product === undefined || typeof data.product === 'string')
      );
  }
  return false;
}

export type LockingShelfData = {
  shelf: AbstractShelfData<
    | 'shelf'
    | 'closing-shelf'
    | 'deep-shelf'
    | 'disappearing-shelf'
    | 'display-shelf'
    | 'supply-shelf'
  >;
  locking: LockingModeData;
  offset?: vec2;
};

export function isLockingShelfData(data: any): data is LockingShelfData {
  return (
    typeof data === 'object' &&
    isAbstractShelfData(data.shelf, [
      'shelf',
      'closing-shelf',
      'deep-shelf',
      'disappearing-shelf',
      'display-shelf',
      'supply-shelf',
    ]) &&
    isLockingModeData(data.locking) &&
    (data.offset === undefined || isVec2(data.offset))
  );
}

/**
 * Locking shelf is locked or unlocked based on some criteria
 *
 * Locked shelves cannot have products added or removed from them
 */
export class LockingShelf extends Shelf {
  private static readonly LOCKING_TIME: number = 0.3;
  private static readonly LOCKING_STYLE: Partial<StyleOptions> = {
    stroke: false,
    fill: true,
    fillColor: 'rgba(255, 128, 0, 0.5)',
  };

  public locked: boolean = false;
  private lockingTime: number = 0;

  public constructor(
    level: Level,
    public shelf: Shelf,
    public locking: LockingMode,
    public offset: vec2 = vec2()
  ) {
    const originalShelfCanDropProductAtIndex =
      shelf.canDropProductAtIndex.bind(shelf);
    shelf.canDropProductAtIndex = (
      product: Product,
      index: number
    ): boolean => {
      if (this.locked) {
        return false;
      }
      return originalShelfCanDropProductAtIndex(product, index);
    };
    const originalShelfCanPickUpProductAtIndex =
      shelf.canPickUpProductAtIndex.bind(shelf);
    shelf.canPickUpProductAtIndex = (
      product: Product,
      index: number
    ): boolean => {
      if (this.locked) {
        return false;
      }
      return originalShelfCanPickUpProductAtIndex(product, index);
    };
    super(level, [], offset, undefined, undefined, true, undefined, false);
  }

  public static fromData(level: Level, data: any): LockingShelf {
    if (!isLockingShelfData(data)) {
      throw new Error('Invalid locking shelf data');
    }
    const shelf = ShelfFactory.createShelf(level, data.shelf);
    let locking: LockingMode;
    if ('product' in data.locking && data.locking.product !== undefined) {
      locking = {
        ...data.locking,
        product: ProductFactory.createProduct(level, data.locking.product),
      } as LockingMode;
    } else {
      locking = { ...data.locking } as LockingMode;
    }
    return new LockingShelf(level, shelf, locking, data.offset || vec2());
  }

  public update(dt: number, level: Level, camera: Camera) {
    this.shelf.position = this.position;
    this.shelf.update(dt, level, camera);

    // Handle locking and unlocking
    this.locked = this.shelfIsLocked(level);

    // Handle locking animation
    this.lockingTime = clamp(
      this.lockingTime + (this.locked ? dt : -dt),
      0,
      LockingShelf.LOCKING_TIME
    );
  }

  private shelfIsLocked(level: Level): boolean {
    switch (this.locking.mode) {
      case 'toggle-timer':
        // Toggle between locked and unlocked on a timer
        if (
          this.locking.finalCountdownUnlock !== undefined &&
          level.data.timeLimit !== undefined &&
          level.data.timeLimit - level.stats.time <=
            this.locking.finalCountdownUnlock
        ) {
          return false; // Unlock during the last n seconds
        }
        return (
          Math.floor(
            level.stats.time / this.locking.time +
              (this.locking.initiallyLocked ? 0 : 0.5)
          ) %
            2 ===
          0
        );

      case 'countdown-timer':
        // Unlock after some amount of time has passed
        return level.stats.time > this.locking.time;

      case 'match-products':
        // Unlock when a certain number of products (optionally a specific type
        // of product) have been matched
        if ('product' in this.locking && this.locking.product !== undefined) {
          const matches = Object.values(level.stats.productMatches).filter(
            ({ product, total }) =>
              this.locking.product!.matchesProduct(product) &&
              // @ts-ignore
              total >= this.locking.n!
          );
          return matches.length > 0;
        }
        return level.stats.totalMatches >= this.locking.n;

      case 'complete-shelves':
        // Unlock when a certain number of shelves have been completed
        return level.stats.totalCompletedShelves >= this.locking.n;

      case 'complete-shelf':
        // Unlock when a specific shelf has been completed
        return !!level.stats.completedShelves[this.locking.shelfReference]
          ?.completed;

      case 'place-product':
        // Unlock when any product or a specific product is placed in the
        // specified shelf slot
        let locked: boolean = false;
        if (this.locking.latch) {
          // In latch mode, we check if the product was ever placed in the slot
          locked = level.stats.productPlacements.some(
            ({ shelf, slot, product }) =>
              // @ts-ignore
              shelf.reference === this.locking.shelfReference &&
              // @ts-ignore
              slot === this.mode.slot &&
              (this.locking.product === undefined ||
                product.matchesProduct(this.locking.product))
          );
        } else {
          // In non-latch mode, we check if the product is currently in the slot
          locked = Object.values(level.stats.currentProductPlacement).some(
            ({ shelf, products }) =>
              // @ts-ignore
              shelf.reference === this.locking.shelfReference &&
              products.some(
                (product, index) =>
                  product !== null &&
                  // @ts-ignore
                  index === this.mode.slot &&
                  (this.locking.product === undefined ||
                    product.matchesProduct(this.locking.product))
              )
          );
        }
        return this.locking.inverted ? !locked : locked;
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
    this.shelf.draw(context);
    const size = this.calculateSize();
    const lockedAmount = remap(
      this.lockingTime,
      0,
      LockingShelf.LOCKING_TIME,
      0,
      size.y
    );
    rectangle(
      context,
      this.position,
      vec2(size.x, lockedAmount),
      LockingShelf.LOCKING_STYLE
    );
  }
}
