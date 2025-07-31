import Camera from '@basementuniverse/camera';
import { rectangle, StyleOptions } from '@basementuniverse/canvas-helpers';
import {
  AABB,
  aabbsOverlap,
  distance,
} from '@basementuniverse/intersection-helpers/2d';
import { isVec2 } from '@basementuniverse/intersection-helpers/utilities';
import { times } from '@basementuniverse/utils';
import { vec2 } from '@basementuniverse/vec';
import { Actor, Product } from '.';
import Level from '../Level';
import { ProductFactory } from '../ProductFactory';

export type ShelfData = {
  products: ShelfProductsData;
  offset?: vec2;
  slotCount?: number;
  matchCount?: number;
  ignore?: boolean;
  reference?: string;
};

export function isShelfData(
  data: any
): data is ShelfData & Record<string, any> {
  return (
    typeof data === 'object' &&
    isShelfProductsData(data.products) &&
    (data.offset === undefined || isVec2(data.offset)) &&
    (data.slotCount === undefined || typeof data.slotCount === 'number') &&
    (data.matchCount === undefined || typeof data.matchCount === 'number') &&
    (data.ignore === undefined || typeof data.ignore === 'boolean') &&
    (data.reference === undefined || typeof data.reference === 'string')
  );
}

export type ShelfProductsData = (string | null)[];

export function isShelfProductsData(data: any): data is ShelfProductsData {
  return (
    Array.isArray(data) &&
    data.every(product => typeof product === 'string' || product === null)
  );
}

export type ShelfProducts = (Product | null)[];

/**
 * Shelf contains some number of products
 *
 * Products can be dragged to and from the shelf
 *
 * When some number of matching products are on the shelf, they disappear
 *
 * If the shelf is empty, it is considered complete
 */
export class Shelf extends Actor {
  protected static readonly DEFAULT_SLOT_COUNT: number = 3;
  protected static readonly DEFAULT_MATCH_COUNT: number = 3;
  protected static readonly DISAPPEAR_DELAY: number = 0.2;
  private static readonly STYLE: Partial<StyleOptions> = {
    strokeColor: 'white',
    lineWidth: 4,
    stroke: true,
    fill: false,
  };

  protected statsUpdated: boolean = false;

  public constructor(
    level: Level,
    public products: ShelfProducts,
    public offset: vec2 = vec2(),
    public slotCount: number = Shelf.DEFAULT_SLOT_COUNT,
    public matchCount: number = Shelf.DEFAULT_MATCH_COUNT,
    public ignore: boolean = false,
    public reference?: string,
    addToLevel: boolean = true
  ) {
    super(level);
    if (addToLevel) {
      level.shelves.push(this);
    }
  }

  public static fromData(level: Level, data: any): Shelf {
    if (!isShelfData(data)) {
      throw new Error('Invalid shelf data');
    }
    const products = data.products.map(productId =>
      productId !== null ? ProductFactory.createProduct(level, productId) : null
    ) as ShelfProducts;
    return new Shelf(
      level,
      products,
      data.offset || vec2(),
      data.slotCount || Shelf.DEFAULT_SLOT_COUNT,
      data.matchCount || Shelf.DEFAULT_MATCH_COUNT,
      data.ignore || false,
      data.reference || undefined
    );
  }

  public calculateSize(): vec2 {
    const productSize = Product.calculateSize();
    const size = vec2();
    size.x = productSize.x * this.slotCount;
    size.y = productSize.y;
    return size;
  }

  public update(dt: number, level: Level, camera: Camera) {
    this.products.forEach((product, index) => {
      product?.update(dt, level, camera, this, index);
    });

    // Remove products that have finished the disappearing animation
    this.products = this.products.map(product => {
      if (product && product.finishedDisappearing) {
        return null;
      }
      return product;
    }) as ShelfProducts;

    // If a match is found, remove the matching products
    const match = this.checkForMatches();
    if (match.found) {
      match.matches.forEach((product, index) => {
        if (product) {
          product.disappear(index * Shelf.DISAPPEAR_DELAY);
        }
      });
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

  public findShelfSlot(product: Product): {
    valid: boolean;
    slotIndex?: number;
    product?: Product | null;
    distance?: number;
  } {
    const aabb = product.getAABB();
    const shelfSlots: { index: number; aabb: AABB; distance: number }[] = times(
      index => ({
        index,
        aabb: this.getAABB(index),
      }),
      this.slotCount
    )
      .filter(slot => this.canDropProductAtIndex(product, slot.index))
      .filter(slot => aabbsOverlap(aabb, slot.aabb).intersects)
      .map(slot => ({
        ...slot,
        distance: distance(
          vec2.add(slot.aabb.position, vec2.div(slot.aabb.size, 2)),
          vec2.add(aabb.position, vec2.div(aabb.size, 2))
        ),
      }))
      .sort((a, b) => a.distance - b.distance);
    const closestSlot = shelfSlots[0];

    if (closestSlot) {
      return {
        valid: true,
        slotIndex: closestSlot.index,
        product: this.products[closestSlot.index],
        distance: closestSlot.distance,
      };
    }

    return { valid: false };
  }

  public canPickUpProductAtIndex(_product: Product, index: number): boolean {
    if (index < 0 || index >= this.slotCount) {
      return false; // Invalid index
    }
    if (this.products[index] === null) {
      return false; // No product in the specified slot
    }
    return true;
  }

  public canDropProductAtIndex(_product: Product, index: number): boolean {
    if (index < 0 || index >= this.slotCount) {
      return false; // Invalid index
    }
    if (this.products[index] !== null) {
      return false; // Slot is already occupied
    }
    return true;
  }

  public shelfIsEmpty(): boolean {
    return this.products.every(product => product === null);
  }

  public shelfIsComplete(): boolean {
    return this.shelfIsEmpty();
  }

  protected checkForMatches(): {
    found: boolean;
    matches: Product[];
  } {
    const validProducts = this.products.filter(
      product => product !== null && !product.disappearing
    ) as Product[];
    const allMatches = this.findMatchingGroups(validProducts);

    // Only return the first matching group found
    return {
      found: allMatches.length > 0,
      matches: allMatches[0],
    };
  }

  private findMatchingGroups(products: Product[]): Product[][] {
    const matches: Product[][] = [];

    // Try each product as a starting point
    for (let i = 0; i < products.length; i++) {
      const startProduct = products[i];
      const group = this.growMatchingGroup([startProduct], products);

      if (group.length >= this.matchCount) {
        matches.push(group.slice(0, this.matchCount));
      }
    }
    return matches;
  }

  private growMatchingGroup(
    currentGroup: Product[],
    availableProducts: Product[]
  ): Product[] {
    // If we have enough matches, stop recursing
    if (currentGroup.length >= this.matchCount) {
      return currentGroup;
    }

    // Find all products that match with every product in the current group
    const matchingProducts = availableProducts.filter(
      product =>
        // Don't include products already in the group
        !currentGroup.includes(product) &&
        // Product must match with all products in the current group
        currentGroup.every(groupProduct => product.matchesProduct(groupProduct))
    );

    // If no matching products are found, stop recursing
    if (matchingProducts.length === 0) {
      return currentGroup;
    }

    // Take the first matching product and add it to the group
    return this.growMatchingGroup(
      [...currentGroup, matchingProducts[0]],
      availableProducts
    );
  }

  public getAABB(index?: number): AABB {
    if (index === undefined) {
      return {
        position: this.position,
        size: this.calculateSize(),
      };
    }
    const productSize = Product.calculateSize();
    return {
      position: vec2.add(this.position, vec2(productSize.x * index, 0)),
      size: productSize,
    };
  }

  public addProductAtIndex(index: number, product: Product): boolean {
    if (index < 0 || index >= this.slotCount) {
      return false; // Invalid index
    }
    if (this.products[index] !== null) {
      return false; // Slot is already occupied
    }
    this.products[index] = product;
    this.statsUpdated = false;
    return true;
  }

  public removeProductAtIndex(index: number): Product | null {
    if (index < 0 || index >= this.slotCount) {
      return null; // Invalid index
    }
    const product = this.products[index];
    this.products[index] = null;
    this.statsUpdated = false;
    return product;
  }

  public lockProductAtIndex(
    index: number,
    locked: boolean = true
  ): boolean | null {
    if (index < 0 || index >= this.slotCount) {
      return null; // Invalid index
    }
    const product = this.products[index];
    if (product === null) {
      return null; // No product to lock
    }
    product.locked = locked;
    return product.locked;
  }

  public draw(context: CanvasRenderingContext2D, drawProducts: boolean = true) {
    context.save();
    rectangle(context, this.position, this.calculateSize(), Shelf.STYLE);
    if (drawProducts) {
      this.products.forEach(product => {
        if (product === null) {
          return;
        }
        if (product.dragging) {
          return; // We will draw the currently dragged product separately
        }
        product.draw(context);
      });
    }
    context.restore();
  }
}
