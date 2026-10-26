import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const localRoot = new URL('../../', import.meta.url);
const override = process.env.XOPS_RUNTIME_DIR;
const runtimeRoot = override ? pathToFileURL(resolve(override) + '/').href : localRoot.href;

export const runtimeUrl = relativePath => new URL(relativePath, runtimeRoot).href;
