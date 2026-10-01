/** Capture files for archives_content. Node only, so the executor imports it lazily. */

import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";
import { CAPTURE_DIR_ENV } from "../tool-contract.ts";

/** Where one capture goes: the checked directory and the file inside it. */
export interface CaptureFile {
  root: string;
  target: string;
}

/**
 * Checks where a capture would be written, before anything is read.
 *
 * @param path - Path as the caller gave it, relative to the capture directory
 * @returns {Promise<CaptureFile>} The directory and the absolute path inside it, not taken yet
 */
export async function resolveCapturePath(path: string): Promise<CaptureFile> {
  const root = await captureRoot();
  const target = resolve(root, path);
  if (!isInside(root, target)) {
    throw new Error(
      `path ${quote(path)} leaves the capture directory ${quote(root)}. Set ${CAPTURE_DIR_ENV} to write elsewhere`,
    );
  }
  await assertNoLinkOut(root, dirname(target));
  if (await exists(target)) {
    throw new Error(`${quote(target)} already exists. Pass a path that does not`);
  }
  return { root, target };
}

/**
 * Writes the bytes to a file that must not exist yet, creating its directory.
 *
 * @param file - Destination returned by {@link resolveCapturePath}
 * @param bytes - Capture body
 */
export async function writeCaptureFile(
  file: Readonly<CaptureFile>,
  bytes: Uint8Array,
): Promise<void> {
  const { root, target } = file;
  await mkdir(dirname(target), { recursive: true });
  await assertNoLinkOut(root, dirname(target));
  try {
    await writeFile(target, bytes, { flag: "wx" });
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      throw new Error(`${quote(target)} appeared before the capture was written`);
    }
    throw error;
  }
}

/**
 * Directory captures go to: `ARCHIVES_CAPTURE_DIR`, else the working directory.
 *
 * @returns {Promise<string>} The directory with every symbolic link resolved
 */
async function captureRoot(): Promise<string> {
  const configured = process.env[CAPTURE_DIR_ENV]?.trim();
  const root = configured ? resolve(configured) : process.cwd();
  try {
    return await realpath(root);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
    throw new Error(`${CAPTURE_DIR_ENV} names ${quote(root)}, which does not exist`);
  }
}

/**
 * Quotes a value for an error, also escaping the C1, bidi and line separators JSON keeps.
 *
 * @param value - Path or directory to name
 * @returns {string} The value as a JSON string with those characters as escapes
 */
function quote(value: string): string {
  return JSON.stringify(value).replaceAll(
    /[\u007F-\u009F\p{Cf}\p{Zl}\p{Zp}]/gu,
    (char) => `\\u{${(char.codePointAt(0) ?? 0).toString(16)}}`,
  );
}

function isInside(root: string, path: string): boolean {
  const rest = relative(root, path);
  return rest !== "" && rest !== ".." && !rest.startsWith(`..${sep}`) && !isAbsolute(rest);
}

/**
 * Rejects a directory whose existing part resolves out of the root through a link.
 *
 * @param root - Capture directory, already resolved
 * @param directory - Directory the file would land in
 */
async function assertNoLinkOut(root: string, directory: string): Promise<void> {
  const real = await deepestExisting(directory);
  if (real !== root && !isInside(root, real)) {
    throw new Error(`path leads out of the capture directory ${quote(root)} through a link`);
  }
}

async function deepestExisting(path: string): Promise<string> {
  for (let current = path; ; current = dirname(current)) {
    try {
      return await realpath(current);
    } catch (error) {
      if (errorCode(error) !== "ENOENT" || dirname(current) === current) throw error;
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}
