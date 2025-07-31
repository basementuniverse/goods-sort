import Camera from '@basementuniverse/camera';
import { rectangle, StyleOptions } from '@basementuniverse/canvas-helpers';
import { clamp, remap } from '@basementuniverse/utils';
import { vec2 } from '@basementuniverse/vec';
import Level from '../Level';
import { ProductFactory } from '../ProductFactory';
import { Product } from './Product';
import {
  isShelfData,
  isShelfProductsData,
  Shelf,
  ShelfData,
  ShelfProducts,
  ShelfProductsData,
} from './Shelf';

export type DisplayShelfData = ShelfData & {
  allowed: ShelfProductsData;
};

export function isDisplayShelfData(data: any): data is DisplayShelfData {
  return isShelfData(data) && isShelfProductsData(data.allowed);
}

/**
 * Display shelf requires specific items to be placed in specific slots
 *
 * Slots can be restricted to only allow these items to be dropped in the slots
 * or to allow any item to be dropped in (although to mark the shelf as
 * complete you must drop the correct items in the slots)
 */
export class DisplayShelf extends Shelf {
  private static readonly COMPLETING_TIME: number = 0.5;
  private static readonly COMPLETING_STYLE: Partial<StyleOptions> = {
    stroke: false,
    fill: true,
    fillColor: 'rgba(0, 255, 0, 0.5)',
  };

  public completed: boolean = false;
  private completingTime: number = 0;
  private finishedCompleting: boolean = false;

  public constructor(
    level: Level,
    public allowed: ShelfProducts,
    public products: ShelfProducts,
    public offset: vec2 = vec2(),
    public slotCount: number = Shelf.DEFAULT_SLOT_COUNT,
    public matchCount: number = Shelf.DEFAULT_MATCH_COUNT,
    public ignore: boolean = false,
    public reference?: string,
    addToLevel: boolean = true
  ) {
    super(
      level,
      products,
      offset,
      slotCount,
      matchCount,
      ignore,
      reference,
      addToLevel
    );
  }

  public static fromData(level: Level, data: any): DisplayShelf {
    if (!isDisplayShelfData(data)) {
      throw new Error('Invalid display shelf data');
    }
    const allowed = data.allowed.map(productId =>
      productId !== null ? ProductFactory.createProduct(level, productId) : null
    ) as ShelfProducts;
    const products = data.products.map(productId =>
      productId !== null ? ProductFactory.createProduct(level, productId) : null
    ) as ShelfProducts;
    return new DisplayShelf(
      level,
      allowed,
      products,
      data.offset || vec2(),
      data.slotCount || Shelf.DEFAULT_SLOT_COUNT,
      data.matchCount || Shelf.DEFAULT_MATCH_COUNT,
      data.ignore || false,
      data.reference || undefined
    );
  }

  public update(dt: number, level: Level, camera: Camera) {
    const productSize = Product.calculateSize();
    this.allowed.forEach((product, index) => {
      if (product === null) {
        return;
      }
      product.positionImmediate = vec2.add(
        this.position,
        vec2.mul(vec2(productSize.x, 0), index)
      );
    });
    this.products.forEach((product, index) => {
      product?.update(dt, level, camera, this, index);
    });

    // If a match is found, complete the shelf
    const match = this.checkForMatches();
    if (match.found) {
      this.completed = true;
    }

    // Update completing animation
    if (this.completed) {
      this.completingTime = clamp(
        this.completingTime + dt,
        0,
        DisplayShelf.COMPLETING_TIME
      );
      if (this.completingTime >= DisplayShelf.COMPLETING_TIME) {
        this.finishedCompleting = true;
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

  protected checkForMatches(): {
    found: boolean;
    matches: Product[];
  } {
    let matches: Product[] = [];
    for (const [index, allowed] of this.allowed.entries()) {
      if (allowed === null && this.products[index] === null) {
        continue;
      }
      if (
        allowed !== null &&
        this.products[index] !== null &&
        this.products[index]?.matchesProduct(allowed)
      ) {
        matches.push(this.products[index]!);
        continue;
      }
      return { found: false, matches: [] };
    }
    return { found: true, matches };
  }

  public canPickUpProductAtIndex(product: Product, index: number): boolean {
    if (this.completed) {
      return false; // Cannot pick up products from a completed shelf
    }
    return super.canPickUpProductAtIndex(product, index);
  }

  public canDropProductAtIndex(product: Product, index: number): boolean {
    if (this.completed) {
      return false; // Cannot drop products on a completed shelf
    }
    return super.canDropProductAtIndex(product, index);
  }

  public shelfIsComplete(): boolean {
    return this.completed;
  }

  public draw(context: CanvasRenderingContext2D) {
    super.draw(context, false);
    context.save();
    this.allowed.forEach(product => {
      if (product === null) {
        return;
      }
      product.drawOutline(context);
    });
    this.products.forEach(product => {
      if (product === null) {
        return;
      }
      if (product.dragging) {
        return; // We will draw the currently dragged product separately
      }
      product.draw(context);
    });
    context.restore();

    if (this.completed) {
      const size = this.calculateSize();
      const completingAmount = this.finishedCompleting
        ? size.y
        : remap(
            this.completingTime,
            0,
            DisplayShelf.COMPLETING_TIME,
            0,
            size.y
          );
      rectangle(
        context,
        this.position,
        vec2(size.x, completingAmount),
        DisplayShelf.COMPLETING_STYLE
      );
    }
  }
}
