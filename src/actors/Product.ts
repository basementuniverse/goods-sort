import Camera from '@basementuniverse/camera';
import { rectangle, StyleOptions } from '@basementuniverse/canvas-helpers';
import InputManager from '@basementuniverse/input-manager';
import { AABB, pointInAABB } from '@basementuniverse/intersection-helpers/2d';
import { vectorsAlmostEqual } from '@basementuniverse/intersection-helpers/utilities';
import { clamp, remap } from '@basementuniverse/utils';
import { vec2 } from '@basementuniverse/vec';
import { Actor, Shelf } from '.';
import Game from '../Game';
import { GameScene } from '../GameScene';
import Level from '../Level';

export type ProductData = {
  id: string;
  name: string;
  image: string;
  matches: string[];
  points?: number;
};

export function isProductData(data: any): data is ProductData {
  return (
    typeof data === 'object' &&
    typeof data.id === 'string' &&
    typeof data.name === 'string' &&
    typeof data.image === 'string' &&
    Array.isArray(data.matches) &&
    data.matches.every((match: any) => typeof match === 'string') &&
    (data.points === undefined || typeof data.points === 'number')
  );
}

export class Product extends Actor {
  public static readonly DEFAULT_POINTS: number = 1;
  private static readonly ASPECT_RATIO: number = 1.5;
  private static readonly STYLE: Partial<StyleOptions> = {
    fill: true,
    stroke: false,
  };
  private static readonly OUTLINE_STYLE: Partial<StyleOptions> = {
    fill: false,
    stroke: true,
    strokeColor: 'rgba(255, 255, 255, 0.8)',
    lineStyle: 'dotted',
  };
  private static readonly BACKGROUND_COLOR: string = 'white';
  private static readonly BACKGROUND_HOVER_COLOR: string = 'green';
  private static readonly MOVE_EASE_AMOUNT: number = 0.35;
  private static readonly MOVE_COOLDOWN_TIME: number = 0.75;
  private static readonly DRAG_ROTATION_AMOUNT: number = 0.02;
  private static readonly ROTATION_EASE_AMOUNT: number = 0.35;
  private static readonly MAX_ROTATION: number = Math.PI / 4;
  private static readonly LANDING_ANIMATION_TIME: number = 0.4;
  private static readonly LANDING_ANIMATION_START_RANGE: number = 5;
  private static readonly LANDING_ANIMATION_X_SCALE_AMOUNT: number = 0.2;
  private static readonly LANDING_ANIMATION_Y_SCALE_AMOUNT: number = -0.3;
  private static readonly DISAPPEARING_ANIMATION_TIME: number = 0.5;
  private static readonly DISAPPEARING_ANIMATION_SCALE_AMOUNT: number = 1.2;
  private static readonly DISAPPEARING_ANIMATION_GROW_TIME: number = 0.2;

  public size: vec2 = vec2();

  public hovered: boolean = false;
  private finishedMoving: boolean = true;

  public dragging: boolean = false;
  private dragOffset: vec2 | null = null;

  private targetPosition: vec2 | null = null;
  private actualPosition: vec2 = vec2();
  private moveTime: number = 0;

  private targetRotation: number | null = null;
  private actualRotation: number = 0;

  public velocity: vec2 = vec2();
  private previousPosition: vec2 | null = null;

  private landingTime: number = 0;
  private previousShelfAndSlot: {
    shelf: Shelf;
    slotIndex: number;
  } | null = null;

  public disappearing: boolean = false;
  public startedDisappearing: boolean = false;
  public finishedDisappearing: boolean = false;
  private disappearingTime: number = 0;
  private disappearingDelay: number = 0;

  public locked: boolean = false;

  public constructor(
    level: Level,
    public id: string,
    public name: string,
    public image: string,
    public matches: string[],
    public points: number = Product.DEFAULT_POINTS
  ) {
    super(level);
  }

  public static fromData(level: Level, data: any): Product {
    if (!isProductData(data)) {
      throw new Error('Invalid product data');
    }
    return new Product(
      level,
      data.id,
      data.name,
      data.image,
      data.matches,
      data.points
    );
  }

  public static calculateSize(): vec2 {
    const size = vec2();
    size.x = Game.screen.x / GameScene.SCREEN_WIDTH_PRODUCTS;
    size.y = size.x * Product.ASPECT_RATIO;
    return size;
  }

  public set positionImmediate(value: vec2) {
    this.actualPosition = vec2.cpy(value);
    this.targetPosition = null;
    this.dragging = false;
    this.finishedMoving = true;
    this.landingTime = 0;
    this.previousShelfAndSlot = null;
  }

  public update(
    dt: number,
    level: Level,
    camera: Camera,
    shelf: Shelf,
    slotIndex: number
  ) {
    this.size = Product.calculateSize();

    // Calculate mouse position in world coordinates
    const mouseWorldPosition = camera.screenToWorld(InputManager.mousePosition);

    // Keep track of previous position for velocity calculation
    this.previousPosition = vec2.cpy(this.actualPosition);

    // Keep track of previous shelf and slot for landing checks
    if (this.previousShelfAndSlot === null) {
      this.previousShelfAndSlot = { shelf, slotIndex };
    }

    // Check if the mouse is hovering over the product
    const intersects = pointInAABB(
      mouseWorldPosition,
      this.getAABB()
    ).intersects;
    this.hovered = intersects || this.dragging;

    // Start dragging when the mouse button is pressed
    if (
      InputManager.mousePressed() &&
      intersects &&
      shelf.canPickUpProductAtIndex(this, slotIndex) &&
      !this.locked
    ) {
      this.dragging = true;
      this.finishedMoving = false;
      this.dragOffset = vec2.sub(mouseWorldPosition, this.actualPosition);
      level.startDraggingProduct(shelf, slotIndex, this);
    }

    // Handle dragging
    if (this.dragging && InputManager.mouseDown()) {
      this.targetPosition = vec2.sub(
        mouseWorldPosition,
        this.dragOffset ?? vec2()
      );
      this.moveTime = Product.MOVE_COOLDOWN_TIME;
    }

    // Handle movement cooldown
    this.moveTime = clamp(this.moveTime - dt, 0, Product.MOVE_COOLDOWN_TIME);

    // If not dragging, snap position to shelf slot
    if (!this.dragging) {
      this.targetPosition = vec2.add(
        shelf.position,
        vec2.mul(vec2(this.size.x, 0), slotIndex)
      );

      // If we've finished the move cooldown, snap to target position
      if (this.moveTime === 0) {
        this.finishedMoving = true;
        this.actualPosition = vec2.cpy(this.targetPosition);
      }

      // If we've almost finished landing on a new shelf and/or slot, start the
      // landing cooldown
      if (
        this.previousShelfAndSlot &&
        (this.previousShelfAndSlot.shelf !== shelf ||
          this.previousShelfAndSlot.slotIndex !== slotIndex) &&
        vec2.len(vec2.sub(this.actualPosition, this.targetPosition)) <
          Product.LANDING_ANIMATION_START_RANGE
      ) {
        this.landingTime = Product.LANDING_ANIMATION_TIME;
        this.previousShelfAndSlot = { shelf, slotIndex };
      }
    }

    // Handle landing animation
    this.landingTime = clamp(
      this.landingTime - dt,
      0,
      Product.LANDING_ANIMATION_TIME
    );

    // Handle disappearing animation
    if (this.disappearing) {
      this.disappearingDelay = clamp(this.disappearingDelay - dt, 0, Infinity);
      if (!this.startedDisappearing && this.disappearingDelay <= 0) {
        this.startedDisappearing = true;
      }
      if (this.startedDisappearing) {
        this.disappearingTime = clamp(
          this.disappearingTime - dt,
          0,
          Product.DISAPPEARING_ANIMATION_TIME
        );
      }
      if (this.disappearingTime <= 0) {
        this.finishedDisappearing = true;
      }
    }

    // Ease movement towards target position
    if (this.targetPosition) {
      if (vectorsAlmostEqual(this.actualPosition, this.targetPosition)) {
        this.actualPosition = vec2.cpy(this.targetPosition);
        if (!this.dragging) {
          this.finishedMoving = true;
        }
      } else {
        const delta = vec2.sub(this.targetPosition, this.actualPosition);
        this.actualPosition = vec2.add(
          this.actualPosition,
          vec2.mul(delta, Product.MOVE_EASE_AMOUNT)
        );
      }
    }

    // Calculate velocity based on position change
    this.velocity = vec2.sub(
      this.actualPosition,
      this.previousPosition ?? vec2()
    );

    // Rotate based on horizontal velocity and ease rotation
    if (this.dragging || !this.finishedMoving) {
      this.targetRotation = this.velocity.x * Product.DRAG_ROTATION_AMOUNT;
    } else {
      this.targetRotation = 0;
    }
    this.actualRotation = clamp(
      this.actualRotation +
        (this.targetRotation - this.actualRotation) *
          Product.ROTATION_EASE_AMOUNT,
      -Product.MAX_ROTATION,
      Product.MAX_ROTATION
    );
  }

  public disappear(delay: number = 0) {
    if (this.disappearing) {
      return; // Already disappearing
    }
    this.disappearing = true;
    this.startedDisappearing = false;
    this.finishedDisappearing = false;
    this.disappearingTime = Product.DISAPPEARING_ANIMATION_TIME;
    this.disappearingDelay = delay;
  }

  public getAABB(): AABB {
    return {
      position: this.actualPosition,
      size: this.size,
    };
  }

  public matchesProduct(other: Product): boolean {
    return this.matches.includes(other.id);
  }

  public draw(context: CanvasRenderingContext2D) {
    const halfSize = vec2.div(this.size, 2);

    context.save();
    context.translate(
      this.actualPosition.x + halfSize.x,
      this.actualPosition.y + halfSize.y
    );
    context.rotate(this.actualRotation);

    // Landing animation
    if (this.landingTime > 0) {
      let size = vec2.cpy(this.size);
      size.x =
        1 +
        Math.sin(
          remap(this.landingTime, 0, Product.LANDING_ANIMATION_TIME, 0, Math.PI)
        ) *
          Product.LANDING_ANIMATION_X_SCALE_AMOUNT;
      size.y =
        1 +
        Math.sin(
          remap(this.landingTime, 0, Product.LANDING_ANIMATION_TIME, 0, Math.PI)
        ) *
          Product.LANDING_ANIMATION_Y_SCALE_AMOUNT;
      context.translate(0, (this.size.y * (1 - size.y)) / 2);
      context.scale(size.x, size.y);
    }

    // Disappearing animation
    if (this.disappearing && this.startedDisappearing) {
      let scale;
      if (
        this.disappearingTime >=
        Product.DISAPPEARING_ANIMATION_TIME -
          Product.DISAPPEARING_ANIMATION_GROW_TIME
      ) {
        scale = remap(
          this.disappearingTime,
          Product.DISAPPEARING_ANIMATION_TIME,
          Product.DISAPPEARING_ANIMATION_TIME -
            Product.DISAPPEARING_ANIMATION_GROW_TIME,
          1,
          Product.DISAPPEARING_ANIMATION_SCALE_AMOUNT
        );
      } else {
        scale = remap(
          this.disappearingTime,
          Product.DISAPPEARING_ANIMATION_TIME -
            Product.DISAPPEARING_ANIMATION_GROW_TIME,
          0,
          Product.DISAPPEARING_ANIMATION_SCALE_AMOUNT,
          0
        );
      }
      context.scale(scale, scale);
    }

    rectangle(context, vec2.mul(halfSize, -0.5), vec2.scale(this.size, 0.5), {
      ...Product.STYLE,
      fillColor: !this.finishedMoving
        ? 'yellow'
        : this.hovered
        ? Product.BACKGROUND_HOVER_COLOR
        : Product.BACKGROUND_COLOR,
    });

    if (this.name) {
      context.fillStyle = 'black';
      context.font = '16px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(this.name, 0, 0);
    }

    if (this.locked) {
      context.fillStyle = 'red';
      context.font = 'bold 16px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('LOCKED', 0, 20);
    }

    context.restore();
  }

  public drawOutline(context: CanvasRenderingContext2D) {
    const size = Product.calculateSize();
    const halfSize = vec2.div(size, 2);

    context.save();
    context.translate(this.actualPosition.x, this.actualPosition.y);

    rectangle(context, vec2(), size, Product.OUTLINE_STYLE);

    if (this.name) {
      context.fillStyle = Product.OUTLINE_STYLE.strokeColor as string;
      context.font = '16px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(this.name, halfSize.x, halfSize.y);
    }

    context.restore();
  }
}
