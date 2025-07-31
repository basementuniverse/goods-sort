import Camera from '@basementuniverse/camera';
import { times } from '@basementuniverse/utils';
import { vec2 } from '@basementuniverse/vec';
import { Actor, Product, Shelf } from '.';
import Level from '../Level';
import { AbstractShelfData, ShelfFactory } from '../ShelfFactory';

export type CarouselData = {
  orientation: 'horizontal' | 'vertical';
  speed: number;
  shelves: AbstractShelfData[];
};

export function isCarouselData(data: any): data is CarouselData {
  return (
    typeof data === 'object' &&
    ['horizontal', 'vertical'].includes(data.orientation) &&
    typeof data.speed === 'number' &&
    Array.isArray(data.shelves) &&
    data.shelves.every(
      (shelf: any) => typeof shelf === 'object' && 'type' in shelf
    )
  );
}

export class Carousel extends Actor {
  private time: number = 0;

  public constructor(
    level: Level,
    public orientation: 'horizontal' | 'vertical',
    public speed: number,
    public shelves: Shelf[]
  ) {
    super(level);
    level.shelves.push(...this.shelves);
  }

  public static fromData(level: Level, data: any): Carousel {
    if (!isCarouselData(data)) {
      throw new Error('Invalid carousel data');
    }
    const shelves = data.shelves.map(shelfData =>
      ShelfFactory.createShelf(level, shelfData)
    );
    return new Carousel(level, data.orientation, data.speed, shelves);
  }

  private calculatePosition(camera: Camera): number {
    const shelfSizes = this.shelves.map(shelf => shelf.calculateSize());
    const { left } = camera.bounds;
    switch (this.orientation) {
      case 'horizontal':
        return left - Math.max(...shelfSizes.map(size => size.x));

      case 'vertical':
        return left - Math.max(...shelfSizes.map(size => size.y));
    }
  }

  private calculateSize(camera: Camera): number {
    const shelfSizes = this.shelves.map(shelf => shelf.calculateSize());
    const { left, right } = camera.bounds;
    switch (this.orientation) {
      case 'horizontal':
        const largestShelfWidth = Math.max(...shelfSizes.map(size => size.x));
        return Math.max(
          largestShelfWidth + (right - left),
          shelfSizes.reduce((acc, size) => acc + size.x, 0)
        );

      case 'vertical':
        const largestShelfHeight = Math.max(...shelfSizes.map(size => size.y));
        return Math.max(
          largestShelfHeight + (right - left),
          shelfSizes.reduce((acc, size) => acc + size.y, 0)
        );
    }
  }

  public update(dt: number, level: Level, camera: Camera) {
    this.time += dt;

    // Position the carousel
    const position = this.calculatePosition(camera);
    switch (this.orientation) {
      case 'horizontal':
        this.position.x = position;
        break;

      case 'vertical':
        this.position.y = position;
        break;
    }

    // Calculate the carousel size and shelf movement speed
    const productSize = Product.calculateSize();
    const carouselSize = this.calculateSize(camera);
    const speed = productSize.x * this.speed;

    // Set initial shelf offsets relative to each other
    const shelfSizes = this.shelves.map(shelf => shelf.calculateSize());
    const shelfOffsets = ((): number[] => {
      switch (this.orientation) {
        case 'horizontal':
          return times(
            index =>
              shelfSizes.slice(0, index).reduce((acc, size) => acc + size.x, 0),
            this.shelves.length
          );

        case 'vertical':
          return times(
            index =>
              shelfSizes.slice(0, index).reduce((acc, size) => acc + size.y, 0),
            this.shelves.length
          );
      }
    })();

    // Re-position and update shelves
    this.shelves.forEach((shelf, index) => {
      // Calculate optional shelf offset
      let offset = vec2.mul(shelf.offset, productSize);
      switch (this.orientation) {
        case 'horizontal':
          shelf.position.x =
            this.position.x +
            offset.x +
            ((this.time * speed + shelfOffsets[index]) % carouselSize);
          shelf.position.y = this.position.y + offset.y;
          break;

        case 'vertical':
          shelf.position.x = this.position.x + offset.x;
          shelf.position.y =
            this.position.y +
            offset.y +
            ((this.time * speed + shelfOffsets[index]) % carouselSize);
          break;
      }
      shelf.update(dt, level, camera);
    });
  }

  public draw(context: CanvasRenderingContext2D) {
    this.shelves.forEach(shelf => {
      shelf.draw(context);
    });
  }
}
