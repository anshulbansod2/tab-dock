import { expect, it } from 'vitest';
import { MSG, PORT_NAME } from '../background/constants.js';
import { loadContent } from './helpers/content.js';

it('content and background agree on the port name and message types', async () => {
  const { constants } = await loadContent('core');
  expect(constants.PORT_NAME).toBe(PORT_NAME);
  expect({ ...constants.MSG }).toEqual({ ...MSG });
});
