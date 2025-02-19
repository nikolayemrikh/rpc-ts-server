import { describe, expect, it } from '@jest/globals';
import { greet } from './index.js';

describe('greet', () => {
  it('should return greeting with name', () => {
    expect(greet('World')).toBe('Hello, World!');
  });
}); 