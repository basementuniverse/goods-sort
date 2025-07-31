import Level from './Level';
import {
  ClosingShelf,
  DeepShelf,
  DisappearingShelf,
  DisplayShelf,
  LockingShelf,
  Shelf,
  SupplyShelf,
} from './actors';

export type AbstractShelfData<T extends string = string> = {
  type: T;
};

export function isAbstractShelfData(
  data: any,
  valid?: string[]
): data is AbstractShelfData {
  return (
    typeof data === 'object' &&
    'type' in data &&
    typeof data.type === 'string' &&
    (valid === undefined || valid.includes(data.type))
  );
}

export class ShelfFactory {
  public static createShelf<T extends Shelf = Shelf>(
    level: Level,
    data: any
  ): T {
    switch (data.type) {
      case 'shelf':
        return Shelf.fromData(level, data) as unknown as T;

      case 'closing-shelf':
        return ClosingShelf.fromData(level, data) as unknown as T;

      case 'supply-shelf':
        return SupplyShelf.fromData(level, data) as unknown as T;

      case 'disappearing-shelf':
        return DisappearingShelf.fromData(level, data) as unknown as T;

      case 'deep-shelf':
        return DeepShelf.fromData(level, data) as unknown as T;

      case 'display-shelf':
        return DisplayShelf.fromData(level, data) as unknown as T;

      case 'locking-shelf':
        return LockingShelf.fromData(level, data) as unknown as T;
    }
    throw new Error(`Unknown shelf type: ${data.type}`);
  }
}
