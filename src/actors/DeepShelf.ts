import Camera from '@basementuniverse/camera';
import { isVec2 } from '@basementuniverse/intersection-helpers/utilities';
import { clamp, lerp, peek, remap, unlerp } from '@basementuniverse/utils';
import { vec2 } from '@basementuniverse/vec';
import Level from '../Level';
import { ProductFactory } from '../ProductFactory';
import { Product } from './Product';
import {
  isShelfProductsData,
  Shelf,
  ShelfData,
  ShelfProducts,
  ShelfProductsData,
} from './Shelf';

export type DeepShelfData = Omit<ShelfData, 'products'> & {
  layers: ShelfProductsData[];
};

export function isDeepShelfData(data: any): data is DeepShelfData {
  return (
    typeof data === 'object' &&
    Array.isArray(data.layers) &&
    data.layers.every((layer: any) => isShelfProductsData(layer)) &&
    (data.offset === undefined || isVec2(data.offset)) &&
    (data.slotCount === undefined || typeof data.slotCount === 'number') &&
    (data.matchCount === undefined || typeof data.matchCount === 'number')
  );
}

/**
 * Deep shelf has multiple layers of products
 *
 * All layers must be cleared for the shelf to be considered complete
 */
export class DeepShelf extends Shelf {
  private static readonly NEXT_LAYER_SCALE: number = 0.9;
  private static readonly NEXT_LAYER_OFFSET: vec2 = vec2(0, -8);
  private static readonly NEXT_LAYER_ALPHA: number = 0.8;
  private static readonly NEXT_LAYER_OVERLAY_COLOR: string =
    'rgba(0, 0, 0, 0.6)';
  private static readonly CHANGING_LAYERS_ANIMATION_TIME: number = 0.5;

  private nextLayerCanvas: HTMLCanvasElement | null = null;
  private nextLayerContext: CanvasRenderingContext2D | null = null;

  private nextNextLayerCanvas: HTMLCanvasElement | null = null;
  private nextNextLayerContext: CanvasRenderingContext2D | null = null;

  private changingLayers: boolean = false;
  private changingLayersTime: number = 0;

  public constructor(
    level: Level,
    public layers: ShelfProducts[],
    offset: vec2 = vec2(),
    slotCount: number = DeepShelf.DEFAULT_SLOT_COUNT,
    matchCount: number = DeepShelf.DEFAULT_MATCH_COUNT,
    ignore: boolean = false,
    reference?: string
  ) {
    super(
      level,
      peek(layers) ?? new Array(slotCount).fill(null),
      offset,
      slotCount,
      matchCount,
      ignore,
      reference
    );

    // Setup next layer canvas (this shows products behind the top layer)
    const size = this.calculateSize();
    this.nextLayerCanvas = document.createElement('canvas');
    this.nextLayerCanvas.width = size.x;
    this.nextLayerCanvas.height = size.y;
    this.nextLayerContext = this.nextLayerCanvas.getContext('2d');
    if (!this.nextLayerContext) {
      throw new Error('Failed to get a context for next layer canvas');
    }

    // Setup next next layer canvas (this shows the new next layer
    // transitioning in during the changing layers animation)
    this.nextNextLayerCanvas = document.createElement('canvas');
    this.nextNextLayerCanvas.width = size.x;
    this.nextNextLayerCanvas.height = size.y;
    this.nextNextLayerContext = this.nextNextLayerCanvas.getContext('2d');
    if (!this.nextNextLayerContext) {
      throw new Error('Failed to get a context for next next layer canvas');
    }
  }

  public static fromData(level: Level, data: any): DeepShelf {
    if (!isDeepShelfData(data)) {
      throw new Error('Invalid DeepShelf data');
    }
    const layers = data.layers.map((layer: ShelfProductsData) =>
      layer.map(productId =>
        productId === null
          ? null
          : ProductFactory.createProduct(level, productId)
      )
    );
    return new DeepShelf(
      level,
      layers,
      data.offset || vec2(),
      data.slotCount || DeepShelf.DEFAULT_SLOT_COUNT,
      data.matchCount || DeepShelf.DEFAULT_MATCH_COUNT,
      data.ignore || false,
      data.reference || undefined
    );
  }

  public update(dt: number, level: Level, camera: Camera) {
    super.update(dt, level, camera);

    // Set position and size for products layers other than the current layer
    this.layers.slice(0, -1).forEach(layer => {
      layer.forEach((product, index) => {
        if (product !== null) {
          product.size = Product.calculateSize();
          product.positionImmediate = vec2.add(
            this.position,
            vec2.mul(vec2(product.size.x, 0), index)
          );
        }
      });
    });

    // Remove products that have finished the disappearing animation
    this.layers.forEach((layer, layerIndex) => {
      this.layers[layerIndex] = layer.map(product => {
        if (product && product.finishedDisappearing) {
          return null;
        }
        return product;
      }) as ShelfProducts;
    });

    // If the current layer is empty, remove it and switch to the next layer
    if (this.layers.length > 0) {
      const currentLayer = peek(this.layers);
      if (this.layerIsEmpty(currentLayer!) && !this.changingLayers) {
        this.changingLayers = true;
        this.changingLayersTime = DeepShelf.CHANGING_LAYERS_ANIMATION_TIME;
      }
    }

    // Handle changing layers animation
    this.changingLayersTime = clamp(
      this.changingLayersTime - dt,
      0,
      DeepShelf.CHANGING_LAYERS_ANIMATION_TIME
    );
    if (this.changingLayers && this.changingLayersTime <= 0) {
      // Always leave 1 layer behind (otherwise the shelf becomes unusable
      // after it is cleared the first time)
      if (this.layers.length > 1) {
        this.layers.pop();
      }
      this.products = peek(this.layers) ?? new Array(this.slotCount).fill(null);
      this.changingLayers = false;
      this.statsUpdated = false;
    }
  }

  private layerIsEmpty(layer: ShelfProducts): boolean {
    return layer.every(product => product === null);
  }

  public shelfIsEmpty(): boolean {
    return this.layers.every(layer => this.layerIsEmpty(layer));
  }

  public shelfIsComplete(): boolean {
    return this.shelfIsEmpty();
  }

  public addProductAtIndex(index: number, product: Product): boolean {
    if (index < 0 || index >= this.slotCount) {
      return false; // Invalid index
    }
    if (this.products[index] !== null) {
      return false; // Slot is already occupied
    }
    if (this.layers.length === 0) {
      return false; // No layers to add to
    }
    this.products[index] = product;
    peek(this.layers)![index] = product;
    return true;
  }

  public removeProductAtIndex(index: number): Product | null {
    if (index < 0 || index >= this.slotCount) {
      return null; // Invalid index
    }
    if (this.layers.length === 0) {
      return null; // No layers to remove from
    }
    const product = this.products[index];
    this.products[index] = null;
    peek(this.layers)![index] = null;
    return product;
  }

  public lockProductAtIndex(
    index: number,
    locked: boolean = true
  ): boolean | null {
    const layer = Math.floor(index / this.slotCount);
    const layerIndex = index % this.slotCount;
    if (
      layer < 0 ||
      layer >= this.layers.length ||
      layerIndex < 0 ||
      layerIndex >= this.slotCount
    ) {
      return null; // Invalid index
    }
    const product = this.layers[layer][layerIndex];
    if (product === null) {
      return null; // No product to lock
    }
    product.locked = locked;
    return product.locked;
  }

  public draw(context: CanvasRenderingContext2D) {
    const size = this.calculateSize();
    const halfSize = vec2.div(size, 2);

    // If we're currently transitioning between layers and there's another
    // layer behind the next one, draw the next next layer
    if (
      this.nextNextLayerCanvas &&
      this.nextNextLayerContext &&
      this.layers.length > 2 &&
      this.changingLayers
    ) {
      this.nextNextLayerCanvas.width = size.x;
      this.nextNextLayerCanvas.height = size.y;
      this.nextNextLayerContext.save();
      this.nextNextLayerContext.clearRect(0, 0, size.x, size.y);
      this.nextNextLayerContext.translate(-this.position.x, -this.position.y);

      const nextNextLayerIndex = this.layers.length - 3;
      this.layers[nextNextLayerIndex].forEach(product => {
        if (product === null) {
          return;
        }
        product.draw(this.nextNextLayerContext!);
      });

      // Render an overlay for the next next layer
      this.nextNextLayerContext.fillStyle = DeepShelf.NEXT_LAYER_OVERLAY_COLOR;
      this.nextNextLayerContext.globalCompositeOperation = 'source-atop';
      this.nextNextLayerContext.fillRect(
        this.position.x,
        this.position.y,
        size.x,
        size.y
      );
      this.nextNextLayerContext.restore();

      // Draw the next next layer canvas onto the main context
      context.save();
      context.globalAlpha = remap(
        this.changingLayersTime,
        DeepShelf.CHANGING_LAYERS_ANIMATION_TIME,
        0,
        0,
        DeepShelf.NEXT_LAYER_ALPHA
      );
      context.translate(
        this.position.x + halfSize.x + DeepShelf.NEXT_LAYER_OFFSET.x,
        this.position.y + halfSize.y + DeepShelf.NEXT_LAYER_OFFSET.y
      );
      context.scale(DeepShelf.NEXT_LAYER_SCALE, DeepShelf.NEXT_LAYER_SCALE);
      context.drawImage(
        this.nextNextLayerCanvas,
        -halfSize.x,
        -halfSize.y,
        size.x,
        size.y
      );
      context.restore();
    }

    // Draw next layer's products
    if (
      this.nextLayerCanvas &&
      this.nextLayerContext &&
      this.layers.length > 1
    ) {
      this.nextLayerCanvas.width = size.x;
      this.nextLayerCanvas.height = size.y;
      this.nextLayerContext.save();
      this.nextLayerContext.clearRect(0, 0, size.x, size.y);
      this.nextLayerContext.translate(-this.position.x, -this.position.y);

      const nextLayerIndex = this.layers.length - 2;
      this.layers[nextLayerIndex].forEach(product => {
        if (product === null) {
          return;
        }
        product.draw(this.nextLayerContext!);
      });

      // Render an overlay for the next layer
      this.nextLayerContext.fillStyle = DeepShelf.NEXT_LAYER_OVERLAY_COLOR;
      this.nextLayerContext.globalCompositeOperation = 'source-atop';
      if (this.changingLayers) {
        this.nextLayerContext.globalAlpha = unlerp(
          0,
          DeepShelf.CHANGING_LAYERS_ANIMATION_TIME,
          this.changingLayersTime
        );
      }
      this.nextLayerContext.fillRect(
        this.position.x,
        this.position.y,
        size.x,
        size.y
      );
      this.nextLayerContext.restore();

      // Draw the next layer canvas onto the main context
      let nextLayerAlpha = DeepShelf.NEXT_LAYER_ALPHA;
      let nextLayerOffset = vec2.cpy(DeepShelf.NEXT_LAYER_OFFSET);
      let nextLayerScale = DeepShelf.NEXT_LAYER_SCALE;
      if (this.changingLayers) {
        const i =
          1 -
          unlerp(
            0,
            DeepShelf.CHANGING_LAYERS_ANIMATION_TIME,
            this.changingLayersTime
          );
        nextLayerAlpha = lerp(DeepShelf.NEXT_LAYER_ALPHA, 1, i);
        nextLayerOffset = vec2(
          lerp(DeepShelf.NEXT_LAYER_OFFSET.x, 0, i),
          lerp(DeepShelf.NEXT_LAYER_OFFSET.y, 0, i)
        );
        nextLayerScale = lerp(DeepShelf.NEXT_LAYER_SCALE, 1, i);
      }
      context.save();
      context.globalAlpha = nextLayerAlpha;
      context.translate(
        this.position.x + halfSize.x + nextLayerOffset.x,
        this.position.y + halfSize.y + nextLayerOffset.y
      );
      context.scale(nextLayerScale, nextLayerScale);
      context.drawImage(
        this.nextLayerCanvas,
        -halfSize.x,
        -halfSize.y,
        size.x,
        size.y
      );
      context.restore();
    }

    // Draw the current layer's products
    super.draw(context);
  }
}
