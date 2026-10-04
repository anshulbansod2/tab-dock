import { expect, it } from 'vitest';
import { MSG } from '../background/constants.js';
import { loadContent } from './helpers/content.js';

it('content and background agree on message types', async () => {
  const { constants } = await loadContent('core');
  expect({ ...constants.MSG }).toEqual({ ...MSG });
});
