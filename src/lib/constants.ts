/**
 * Shared constants for jokehub.
 */

/**
 * Sentinel userId used to identify server-side / system write operations.
 * jokeService treats writes carrying this userId as trusted (skips ownership
 * check) so API routes and backend flows can update jokes without being the
 * owning user.
 */
export const SYSTEM_USER_ID = 'server-process';
