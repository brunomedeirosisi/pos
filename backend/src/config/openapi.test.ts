import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
describe('OpenAPI boot document',()=>{
  it('parses the complete document loaded by app startup and preserves printer capability boundaries',()=>{
    const document=YAML.parse(readFileSync(new URL('../../openapi/openapi.yaml',import.meta.url),'utf8'));
    expect(document.openapi).toBe('3.0.3');
    const enroll=document.paths['/api/v1/print-agent/enroll'].post;
    expect(enroll.security).toEqual([]);
    expect(enroll.requestBody.content['application/json'].schema.properties.token.writeOnly).toBe(true);
    expect(document.paths['/api/v1/print-agent/claim'].post.security).toEqual([{printAgentToken:[]}]);
    expect(document.paths['/api/v1/print-printers/enrollments'].post.responses['201']).toBeDefined();
    expect(document.paths['/api/v1/sales/{id}/receipt/print'].post.responses['202']).toBeDefined();
  });
});
