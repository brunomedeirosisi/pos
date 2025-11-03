import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { router as healthRouter } from './routes/health.js';
import { router as authRouter } from './routes/auth.js';
import { router as productGroupsRouter } from './routes/product-groups.js';
import { router as productsRouter } from './routes/products.js';
import { router as customersRouter } from './routes/customers.js';
import { router as sellersRouter } from './routes/sellers.js';
import { router as paymentTermsRouter } from './routes/payment-terms.js';
import { router as salesRouter } from './routes/sales.js';
import { router as usersRouter } from './routes/users.js';
import { router as rolesRouter } from './routes/roles.js';
import { router as adminBackupsRouter } from './routes/admin-backups.js';
import { router as adminLegacyImportRouter } from './routes/admin-legacy-import.js';
import { errorHandler } from './middleware/error-handler.js';
import { requireAuth } from './middleware/auth.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const openApiPath = path.resolve(currentDir, '../openapi/openapi.yaml');
const openApiDocument = YAML.parse(readFileSync(openApiPath, 'utf8'));

const app = express();
app.set('trust proxy', true);
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.get('/api/v1/openapi.json', (_req, res) => {
  res.json(openApiDocument);
});

app.use(requireAuth);

app.use('/api/v1/product-groups', productGroupsRouter);
app.use('/api/v1/products', productsRouter);
app.use('/api/v1/customers', customersRouter);
app.use('/api/v1/sellers', sellersRouter);
app.use('/api/v1/payment-terms', paymentTermsRouter);
app.use('/api/v1/sales', salesRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/roles', rolesRouter);
app.use('/api/v1/admin', adminBackupsRouter);
app.use('/api/v1/admin', adminLegacyImportRouter);

app.use(errorHandler);

const port = process.env.API_PORT || 8080;
app.listen(port, () => {
  console.log(`[api] up on :${port}`);
});
