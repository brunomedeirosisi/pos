import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.resolve(currentDir, '../openapi/openapi.yaml');

await SwaggerParser.validate(specPath);
console.log(`[openapi] valid: ${specPath}`);

