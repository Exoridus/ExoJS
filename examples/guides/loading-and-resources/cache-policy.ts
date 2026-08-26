import type { CacheContext, CachePolicy } from '@codexo/exojs';

// #region guide:cache-policy
class MyCacheFirstPolicy implements CachePolicy {
  public async resolve<T>(context: CacheContext<T>): Promise<T> {
    const cached = await context.read();

    if (cached.hit) {
      return cached.value;
    }

    const value = await context.fetch();

    await context.write(value);

    return value;
  }
}
// #endregion guide:cache-policy
