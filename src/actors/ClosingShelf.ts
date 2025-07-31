import Camera from '@basementuniverse/camera';
import { rectangle, StyleOptions } from '@basementuniverse/canvas-helpers';
import { clamp, remap } from '@basementuniverse/utils';
import { vec2 } from '@basementuniverse/vec';
import Level from '../Level';
import { ProductFactory } from '../ProductFactory';
import { Product } from './Product';
import { isShelfData, Shelf, ShelfData, ShelfProducts } from './Shelf';

export type ClosingShelfData = ShelfData;

export function isClosingShelfData(data: any): data is ClosingShelfData {
  return isShelfData(data);
}

/**
 * Closing shelf closes when a matching set of products is added, and no more
 * products can be added or removed
 */
export class ClosingShelf extends Shelf {
  private static readonly CLOSING_TIME: number = 0.5;
  private static readonly CLOSING_STYLE: Partial<StyleOptions> = {
    stroke: false,
    fill: true,
    fillColor: 'rgba(0, 0, 0, 0.5)',
  };

  public closed: boolean = false;
  private closingTime: number = 0;
  private finishedClosing: boolean = false;

  public static fromData(level: Level, data: any): ClosingShelf {
    if (!isClosingShelfData(data)) {
      throw new Error('Invalid closing shelf data');
    }
    const products = data.products.map(productId =>
      productId !== null ? ProductFactory.createProduct(level, productId) : null
    ) as ShelfProducts;
    return new ClosingShelf(
      level,
      products,
      data.offset || vec2(),
      data.slotCount || ClosingShelf.DEFAULT_SLOT_COUNT,
      data.matchCount || ClosingShelf.DEFAULT_MATCH_COUNT,
      data.ignore || false,
      data.reference || undefined
    );
  }

  public update(dt: number, level: Level, camera: Camera) {
    this.products.forEach((product, index) => {
      product?.update(dt, level, camera, this, index);
    });

    // If a match is found, close the shelf
    const match = this.checkForMatches();
    if (match.found) {
      this.closed = true;
    }

    // Update closing animation
    if (this.closed) {
      this.closingTime = clamp(
        this.closingTime + dt,
        0,
        ClosingShelf.CLOSING_TIME
      );
      if (this.closingTime >= ClosingShelf.CLOSING_TIME) {
        this.finishedClosing = true;
      }
    }

    // Update stats
    if (!this.statsUpdated) {
      if (match.found) {
        match.matches.forEach(product => {
          if (product) {
            level.stats.productMatches[product.id].total++;
            level.stats.totalMatches++;
          }
        });
        this.statsUpdated = true;
      }
      if (this.shelfIsComplete()) {
        level.stats.totalCompletedShelves++;
        this.statsUpdated = true;
      }
    }
  }

  public canPickUpProductAtIndex(product: Product, index: number): boolean {
    if (this.closed) {
      return false; // Cannot pick up products from a closed shelf
    }
    return super.canPickUpProductAtIndex(product, index);
  }

  public canDropProductAtIndex(product: Product, index: number): boolean {
    if (this.closed) {
      return false; // Cannot drop products on a closed shelf
    }
    return super.canDropProductAtIndex(product, index);
  }

  public shelfIsComplete(): boolean {
    return this.closed;
  }

  public draw(context: CanvasRenderingContext2D) {
    super.draw(context);

    if (this.closed) {
      const size = this.calculateSize();
      const closingAmount = this.finishedClosing
        ? size.y
        : remap(this.closingTime, 0, ClosingShelf.CLOSING_TIME, 0, size.y);
      rectangle(
        context,
        this.position,
        vec2(size.x, closingAmount),
        ClosingShelf.CLOSING_STYLE
      );
    }
  }
}
