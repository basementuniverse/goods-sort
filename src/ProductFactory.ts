import ContentManager from '@basementuniverse/content-manager';
import { isProductData, Product, ProductData } from './actors/Product';
import Level from './Level';

export function isProductsData(data: any): data is ProductData[] {
  return (
    Array.isArray(data) && data.every((datum: any) => isProductData(datum))
  );
}

export class ProductFactory {
  private static productDefinitions: Record<string, ProductData> = {};

  public static get productIds(): string[] {
    if (!this.productDefinitions) {
      throw new Error('Product definitions not initialized');
    }
    return Object.keys(this.productDefinitions);
  }

  public static initialise() {
    const productsData = ContentManager.get('products');
    if (!productsData) {
      throw new Error('Product definitions not found');
    }
    if (!isProductsData(productsData)) {
      throw new Error('Invalid product definitions data');
    }
    this.productDefinitions = Object.fromEntries(
      productsData.map(product => [product.id, product])
    );
  }

  public static createProduct(level: Level, id: string, data?: any): Product {
    const productData = this.productDefinitions[id];
    if (!productData) {
      throw new Error(`Product id "${id}" not found`);
    }
    return Product.fromData(level, {
      ...productData,
      ...(data ?? {}),
    });
  }
}
