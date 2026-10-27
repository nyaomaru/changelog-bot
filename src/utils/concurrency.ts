import { isSafeInteger } from '@/utils/is.js';

/**
 * Map elements of an array asynchronously with a bounded concurrency limit.
 * Preserves the original element ordering in the output array.
 * @param items Readonly array of items to process.
 * @param concurrency Maximum number of promises executing concurrently. Must be a positive integer.
 * @param mapper Async mapping function called for each element.
 * @returns Promise resolving to an array of mapped elements in the original item order.
 */
export async function mapConcurrent<Item, Result>(
  items: readonly Item[],
  concurrency: number,
  mapper: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  if (items.length === 0) {
    return [];
  }

  // WHY: Clamp to at least 1 and ensure integer bounds to prevent invalid pool sizes.
  const boundedLimit =
    isSafeInteger(concurrency) && concurrency >= 1 ? concurrency : 1;

  const results: Result[] = new Array(items.length);
  let nextItemIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextItemIndex < items.length) {
      const currentItemIndex = nextItemIndex;
      nextItemIndex += 1;
      // WHY: Writing directly to results[currentItemIndex] preserves deterministic
      // array ordering regardless of the order in which async tasks complete.
      results[currentItemIndex] = await mapper(
        items[currentItemIndex],
        currentItemIndex,
      );
    }
  };

  const poolSize = Math.min(items.length, boundedLimit);
  const workers = Array.from({ length: poolSize }, () => worker());
  await Promise.all(workers);

  return results;
}
