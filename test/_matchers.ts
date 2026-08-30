import { expect } from "vitest";

/**
 * Keeps Vitest's `any`-typed asymmetric matcher behind an `unknown` boundary.
 *
 * @param expected - Partial shape the received value must contain.
 * @returns {unknown} An opaque asymmetric matcher accepted by `expect`.
 */
export function objectContaining<T>(expected: T): unknown {
  return expect.objectContaining(expected);
}

/**
 * Exposes Vitest's constructor matcher without leaking its `any` return type.
 *
 * @param constructor - Constructor accepted by Vitest.
 * @returns {unknown} An opaque asymmetric matcher.
 */
export function anyValue(constructor: unknown): unknown {
  return expect.any(constructor);
}

/**
 * Exposes Vitest's substring matcher without leaking its `any` return type.
 *
 * @param expected - Substring the received string must contain.
 * @returns {unknown} An opaque asymmetric matcher.
 */
export function stringContaining(expected: string): unknown {
  return expect.stringContaining(expected);
}

/**
 * Reconstructs the range sentence from numeric TypeBox schema fields.
 *
 * @param parameter - JSON Schema parameter definition.
 * @returns {string} The range fragment emitted by the tool schema.
 */
export function rangeDescription(parameter: Readonly<Record<string, unknown>> | undefined): string {
  const minimum = parameter?.["minimum"];
  const maximum = parameter?.["maximum"];
  if (typeof minimum !== "number" || typeof maximum !== "number") {
    throw new TypeError("Expected numeric minimum and maximum schema fields");
  }
  return `accepted range: ${minimum}-${maximum}`;
}
