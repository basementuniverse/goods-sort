import Camera from '@basementuniverse/camera';
import Debug from '@basementuniverse/debug';
import InputManager from '@basementuniverse/input-manager';
import { isVec2 } from '@basementuniverse/intersection-helpers/utilities';
import { vec2 } from '@basementuniverse/vec';
import {
  Actor,
  Carousel,
  Collapse,
  Product,
  Shelf,
  ShelfProducts,
} from './actors';
import * as constants from './constants';
import { ProductFactory } from './ProductFactory';
import { ShelfFactory } from './ShelfFactory';

export type LevelData = {
  id: string;
  name: string;
  description?: string;
  grid: {
    width: number;
    height: number;
  };
  lockedProducts?: {
    shelfReference: number;
    slot: number;
  }[];
  actors: {
    gridPosition: vec2;
    type: string;
    [key: string]: any;
  }[];
  timeLimit?: number;
};

export function isLevelData(data: any): data is LevelData {
  return (
    typeof data === 'object' &&
    typeof data.id === 'string' &&
    typeof data.name === 'string' &&
    (data.description === undefined || typeof data.description === 'string') &&
    typeof data.grid === 'object' &&
    typeof data.grid.width === 'number' &&
    typeof data.grid.height === 'number' &&
    (data.lockedProducts === undefined ||
      (Array.isArray(data.lockedProducts) &&
        data.lockedProducts.every(
          (lockedProduct: any) =>
            typeof lockedProduct === 'object' &&
            typeof lockedProduct.shelfReference === 'string' &&
            typeof lockedProduct.slot === 'number'
        ))) &&
    Array.isArray(data.actors) &&
    data.actors.every(
      (actor: any) =>
        typeof actor === 'object' &&
        isVec2(actor.gridPosition) &&
        typeof actor.type === 'string'
    ) &&
    (data.timeLimit === undefined || typeof data.timeLimit === 'number')
  );
}

export default class Level {
  public data: LevelData;
  private actors: {
    gridPosition: vec2;
    actor: Actor;
  }[] = [];
  private draggingProduct: {
    shelf: Shelf;
    slotIndex: number;
    product: Product;
  } | null = null;

  public shelves: Shelf[] = [];
  public completed: boolean = false;
  public stats: {
    /**
     * Total time spent on this level, in seconds
     */
    time: number;

    /**
     * Number of matches made, indexed by product id
     */
    productMatches: Record<
      string,
      {
        product: Product;
        total: number;
      }
    >;

    /**
     * Total number of matches made across all products
     */
    totalMatches: number;

    /**
     * Currently completed shelves, indexed by shelf reference
     *
     * Only shelves with a reference are tracked
     */
    completedShelves: Record<
      string,
      {
        shelf: Shelf;
        completed: boolean;
      }
    >;

    /**
     * Total number of shelves completed
     */
    totalCompletedShelves: number;

    /**
     * A list of all product placements made by the player
     *
     * Only shelves with a reference are tracked
     */
    productPlacements: {
      shelf: Shelf;
      slot: number;
      product: Product;
    }[];

    /**
     * Current product placements, indexed by shelf reference
     *
     * Only shelves with a reference are tracked
     */
    currentProductPlacement: Record<
      string,
      {
        shelf: Shelf;
        products: ShelfProducts;
      }
    >;
  };

  public constructor(data: LevelData) {
    this.data = data;
    this.data.actors.forEach(actorData => {
      this.actors.push({
        gridPosition: actorData.gridPosition,
        actor: this.createActor(actorData.type, actorData),
      });
    });

    // Apply product locking
    const shelvesWithReference = this.shelves.filter(
      shelf => shelf.reference !== undefined
    );
    const shelvesByReference: Record<string, Shelf> =
      shelvesWithReference.reduce(
        (acc, shelf) => ({
          ...acc,
          [shelf.reference!]: shelf,
        }),
        {}
      );
    if (this.data.lockedProducts) {
      this.data.lockedProducts.forEach(lock => {
        const { shelfReference, slot } = lock;
        if (!shelvesByReference[shelfReference]) {
          return;
        }
        shelvesByReference[shelfReference].lockProductAtIndex(slot);
      });
    }

    // Initialise stats
    this.stats = {
      time: 0,
      productMatches: Object.fromEntries(
        ProductFactory.productIds.map(id => [
          id,
          {
            product: ProductFactory.createProduct(this, id),
            total: 0,
          },
        ])
      ),
      totalMatches: 0,
      completedShelves: Object.fromEntries(
        shelvesWithReference.map(shelf => [
          shelf.reference,
          { shelf, completed: false },
        ])
      ),
      totalCompletedShelves: 0,
      productPlacements: [],
      currentProductPlacement: Object.fromEntries(
        Object.values(shelvesByReference).map(shelf => [
          shelf,
          shelf.products.map((product, slot) => ({
            shelf,
            slot,
            product,
          })),
        ])
      ),
    };
  }

  public static fromData(data: any): Level {
    if (!isLevelData(data)) {
      throw new Error('Invalid level data');
    }
    return new Level(data);
  }

  public createActor(type: string, data: any): Actor {
    switch (type) {
      case 'shelf':
      case 'closing-shelf':
      case 'supply-shelf':
      case 'disappearing-shelf':
      case 'deep-shelf':
      case 'display-shelf':
      case 'locking-shelf':
        return ShelfFactory.createShelf(this, data);

      case 'carousel':
        return Carousel.fromData(this, data);

      case 'collapse':
        return Collapse.fromData(this, data);
    }
    throw new Error(`Unknown actor type: ${type}`);
  }

  public update(dt: number, camera: Camera) {
    const productSize = Product.calculateSize();
    const gridSizePixels = vec2(
      this.data.grid.width * productSize.x,
      this.data.grid.height * productSize.y
    );
    const gridTopLeft = vec2.mul(gridSizePixels, -0.5);

    this.actors.forEach(({ actor, gridPosition }) => {
      actor.position = vec2.add(
        gridTopLeft,
        vec2.mul(gridPosition, productSize)
      );

      // If the actor has an offset, apply it now
      if ('offset' in actor && actor.offset) {
        actor.position = vec2.add(
          actor.position,
          vec2.mul(actor.offset as vec2, productSize)
        );
      }
      actor.update(dt, this, camera);
    });

    if (!InputManager.mouseDown() && this.draggingProduct) {
      this.finishDraggingProduct();
    }

    // Check if all shelves are completed
    if (
      !this.completed &&
      this.shelves.every(shelf => shelf.ignore || shelf.shelfIsComplete())
    ) {
      this.completed = true;
      console.log('All shelves completed!');
    }

    // Remove disposed actors and shelves
    this.actors = this.actors.filter(({ actor }) => !actor.disposed);
    this.shelves = this.shelves.filter(shelf => !shelf.disposed);

    // Update stats
    const shelvesWithReference = this.shelves.filter(shelf => shelf.reference);
    this.stats.time += dt;
    this.stats.completedShelves = Object.fromEntries(
      shelvesWithReference.map(shelf => [
        shelf.reference,
        { shelf, completed: shelf.shelfIsComplete() },
      ])
    );
    this.stats.currentProductPlacement = Object.fromEntries(
      shelvesWithReference.map(shelf => [
        shelf.reference,
        {
          shelf,
          products: shelf.products,
        },
      ])
    );
  }

  public startDraggingProduct(
    shelf: Shelf,
    slotIndex: number,
    product: Product
  ) {
    this.draggingProduct = {
      shelf,
      slotIndex,
      product,
    };
  }

  private finishDraggingProduct() {
    if (!this.draggingProduct) {
      return;
    }

    const result = this.isValidDropPosition(this.draggingProduct.product);
    if (result.valid && result.shelf && result.slotIndex !== undefined) {
      this.draggingProduct.shelf.removeProductAtIndex(
        this.draggingProduct.slotIndex
      );
      result.shelf.addProductAtIndex(
        result.slotIndex,
        this.draggingProduct.product
      );

      // Update stats
      if (result.shelf.reference) {
        this.stats.productPlacements.push({
          shelf: result.shelf,
          slot: result.slotIndex,
          product: this.draggingProduct.product,
        });
      }
    }

    this.draggingProduct.product.dragging = false;
    this.draggingProduct = null;
  }

  private isValidDropPosition(product: Product): {
    valid: boolean;
    shelf?: Shelf;
    slotIndex?: number;
  } {
    const results: (ReturnType<Shelf['findShelfSlot']> & {
      shelf: Shelf;
    })[] = [];

    for (const shelf of this.shelves) {
      const result = shelf.findShelfSlot(product);
      if (result.valid) {
        results.push({
          shelf,
          ...result,
        });
      }
    }

    results.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    const closestResult = results[0];

    if (
      closestResult &&
      closestResult.valid &&
      closestResult.slotIndex !== undefined
    ) {
      return {
        valid: true,
        shelf: closestResult.shelf,
        slotIndex: closestResult.slotIndex,
      };
    }

    return { valid: false };
  }

  public draw(context: CanvasRenderingContext2D, camera: Camera) {
    if (constants.DEBUG) {
      const productSize = Product.calculateSize();
      const gridSizePixels = vec2(
        this.data.grid.width * productSize.x,
        this.data.grid.height * productSize.y
      );
      const gridTopLeft = camera.worldToScreen(vec2.mul(gridSizePixels, -0.5));
      for (let x = 0; x < this.data.grid.width; x++) {
        for (let y = 0; y < this.data.grid.height; y++) {
          Debug.border(
            `grid-${x}-${y}-border`,
            '',
            vec2.add(gridTopLeft, vec2.mul(vec2(x, y), productSize)),
            {
              size: productSize,
              showLabel: false,
              showValue: false,
              borderColour: 'rgba(255, 0, 0, 0.5)',
              borderStyle: 'dashed',
              space: 'screen',
            }
          );
        }
      }
    }

    this.actors.forEach(({ actor }) => {
      actor.draw(context);
    });

    if (this.draggingProduct) {
      this.draggingProduct.product.draw(context);
    }
  }
}
