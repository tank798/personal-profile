import fs from 'node:fs';

const file = 'api/openapi.yaml';
if (!fs.existsSync(file)) {
  console.error('openapi.yaml not found');
  process.exit(1);
}

const content = fs.readFileSync(file, 'utf8');
const checks = ['openapi: 3.0.3', '/api/v1/auth/login', '/api/v1/admin/posts', '/api/v1/profile'];

for (const check of checks) {
  if (!content.includes(check)) {
    console.error(`Missing required token: ${check}`);
    process.exit(1);
  }
}

console.log('OpenAPI quick check: OK');
