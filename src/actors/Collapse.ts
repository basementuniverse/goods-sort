import Camera from '@basementuniverse/camera';
import { AABB } from '@basementuniverse/intersection-helpers/2d';
import { vectorsAlmostEqual } from '@basementuniverse/intersection-helpers/utilities';
import { clamp, lerp } from '@basementuniverse/utils';
import { vec2 } from '@basementuniverse/vec';
import { Actor, Product, Shelf } from '.';
import Level from '../Level';
import { AbstractShelfData, ShelfFactory } from '../ShelfFactory';

function easeOutBounce(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) {
    return n1 * x * x;
  } else if (x < 2 / d1) {
    return n1 * (x -= 1.5 / d1) * x + 0.75;
  } else if (x < 2.5 / d1) {
    return n1 * (x -= 2.25 / d1) * x + 0.9375;
  } else {
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  }
}

export type CollapseData = {
  grid: {
    width: number;
    height: number;
  };
  orientation: 'horizontal' | 'vertical';
  direction: 'positive' | 'negative' | 'center';
  actors: (
    | AbstractShelfData
    | (CollapseData & {
        type: 'collapse';
      })
  )[];
};

export function isCollapseData(data: any): data is CollapseData {
  return (
    typeof data === 'object' &&
    typeof data.grid === 'object' &&
    typeof data.grid.width === 'number' &&
    typeof data.grid.height === 'number' &&
    ['horizontal', 'vertical'].includes(data.orientation) &&
    ['positive', 'negative', 'center'].includes(data.direction) &&
    Array.isArray(data.actors) &&
    data.actors.every(
      (actor: any) =>
        typeof actor === 'object' && ('type' in actor || isCollapseData(actor))
    )
  );
}

type InternalActor = Collapse | Shelf;

export class Collapse extends Actor {
  private static readonly COLLAPSE_TIME: number = 1.5;

  private actorStates: Map<
    InternalActor,
    {
      targetPosition: vec2;
      oldPosition?: vec2;
      easeProgress?: number;
    }
  > = new Map();

  public constructor(
    level: Level,
    public grid: { width: number; height: number },
    public orientation: 'horizontal' | 'vertical',
    public direction: 'positive' | 'negative' | 'center',
    public actors: InternalActor[]
  ) {
    super(level);
    level.shelves.push(
      ...(this.actors.filter(a => a instanceof Shelf) as Shelf[])
    );

    // Initialise actor states
    this.actors.forEach(actor => {
      this.actorStates.set(actor, {
        targetPosition: vec2(),
      });
    });

    // Initialise actor positions
    this.calculateTargetPositions();
    this.actors.forEach(actor => {
      if (this.actorStates.has(actor)) {
        const state = this.actorStates.get(actor)!;
        actor.position = vec2.add(this.position, state.targetPosition);
        state.oldPosition = vec2.cpy(state.targetPosition);
        state.easeProgress = 0;
      }
    });
  }

  public static fromData(level: Level, data: any): Collapse {
    if (!isCollapseData(data)) {
      throw new Error('Invalid collapse data');
    }
    const actors = data.actors.map(actorData => {
      if (actorData.type === 'collapse') {
        return Collapse.fromData(level, actorData);
      }
      return ShelfFactory.createShelf(level, actorData);
    });
    return new Collapse(
      level,
      data.grid,
      data.orientation,
      data.direction,
      actors
    );
  }

  public calculateSize(): vec2 {
    const size = vec2();
    this.actors.forEach(actor => {
      const actorSize = actor.calculateSize();
      switch (this.orientation) {
        case 'horizontal':
          size.x += actorSize.x;
          size.y = Math.max(size.y, actorSize.y);
          break;

        case 'vertical':
          size.x = Math.max(size.x, actorSize.x);
          size.y += actorSize.y;
          break;
      }
    });
    return size;
  }

  public getAABB(): AABB {
    return {
      position: this.position,
      size: this.calculateSize(),
    };
  }

  private calculateGridSize(): vec2 {
    return vec2.mul(
      vec2(this.grid.width, this.grid.height),
      Product.calculateSize()
    );
  }

  private calculateStartPosition(): vec2 {
    const gridSize = this.calculateGridSize();
    const contentSize = this.calculateSize();
    const startPosition = vec2();
    switch (this.orientation) {
      case 'horizontal':
        switch (this.direction) {
          case 'positive':
            startPosition.x = gridSize.x - contentSize.x;
            startPosition.y = 0;
            break;

          case 'negative':
            startPosition.x = 0;
            startPosition.y = 0;
            break;

          case 'center':
            startPosition.x = (gridSize.x - contentSize.x) / 2;
            startPosition.y = 0;
            break;
        }
        break;

      case 'vertical':
        switch (this.direction) {
          case 'positive':
            startPosition.x = 0;
            startPosition.y = gridSize.y - contentSize.y;
            break;

          case 'negative':
            startPosition.x = 0;
            startPosition.y = 0;
            break;

          case 'center':
            startPosition.x = 0;
            startPosition.y = (gridSize.y - contentSize.y) / 2;
            break;
        }
        break;
    }
    return startPosition;
  }

  private calculateTargetPositions() {
    const startPosition = this.calculateStartPosition();
    let current = vec2();
    this.actors.forEach(actor => {
      const actorSize = actor.calculateSize();
      const targetPosition = vec2.add(startPosition, current);

      if (this.actorStates.has(actor)) {
        const state = this.actorStates.get(actor)!;
        state.targetPosition = targetPosition;
      } else {
        this.actorStates.set(actor, { targetPosition });
      }
      switch (this.orientation) {
        case 'horizontal':
          current.x += actorSize.x;
          break;

        case 'vertical':
          current.y += actorSize.y;
          break;
      }
    });
  }

  public update(dt: number, level: Level, camera: Camera) {
    this.calculateTargetPositions();
    this.actors.forEach(actor => {
      if (this.actorStates.has(actor)) {
        const state = this.actorStates.get(actor)!;
        if (
          state.easeProgress === undefined ||
          state.easeProgress >= 1 ||
          vectorsAlmostEqual(
            actor.position,
            vec2.add(this.position, state.targetPosition)
          )
        ) {
          actor.position = vec2.add(this.position, state.targetPosition);
          state.easeProgress = 0;
          state.oldPosition = vec2.cpy(state.targetPosition);
        } else {
          state.easeProgress = clamp(
            (state.easeProgress ?? 1) + dt / Collapse.COLLAPSE_TIME,
            0,
            1
          );
          const easedPosition = vec2(
            lerp(
              state.oldPosition?.x ?? 0,
              state.targetPosition.x,
              easeOutBounce(state.easeProgress)
            ),
            lerp(
              state.oldPosition?.y ?? 0,
              state.targetPosition.y,
              easeOutBounce(state.easeProgress)
            )
          );
          actor.position = vec2.add(this.position, easedPosition);
        }
      }
      actor.update(dt, level, camera);
    });

    // If this collapse has no actors, it can be disposed
    if (this.actors.length === 0) {
      this.disposed = true;
    }

    this.actors = this.actors.filter(actor => !actor.disposed);
  }

  public draw(context: CanvasRenderingContext2D) {
    this.actors.forEach(actor => {
      actor.draw(context);
    });
  }
}
