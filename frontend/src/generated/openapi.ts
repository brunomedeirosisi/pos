/* eslint-disable */
export interface paths {
  '/api/v1/auth/login': {
    post: {
      requestBody: {
        content: {
          'application/json': LoginRequest;
        };
      };
      responses: {
        200: { content: { 'application/json': LoginResponse } };
        400: { content: { 'application/json': ErrorResponse } };
        401: { content: { 'application/json': ErrorResponse } };
      };
    };
  };
  '/api/v1/auth/me': {
    get: {
      responses: {
        200: { content: { 'application/json': { user: AuthenticatedUser } } };
        401: { content: { 'application/json': ErrorResponse } };
      };
    };
  };
  '/api/v1/sales': {
    get: {
      parameters?: {
        query?: {
          from?: string;
          to?: string;
          seller_id?: string;
          customer_id?: string;
          payment_term_id?: string;
          limit?: number;
        };
      };
      responses: {
        200: { content: { 'application/json': Sale[] } };
        401: { content: { 'application/json': ErrorResponse } };
        403: { content: { 'application/json': ErrorResponse } };
      };
    };
    post: {
      requestBody: {
        content: {
          'application/json': SaleWrite;
        };
      };
      responses: {
        201: { content: { 'application/json': Sale } };
        400: { content: { 'application/json': ErrorResponse } };
        401: { content: { 'application/json': ErrorResponse } };
        403: { content: { 'application/json': ErrorResponse } };
      };
    };
  };
  '/api/v1/sales/{id}': {
    get: {
      parameters: {
        path: { id: string };
      };
      responses: {
        200: { content: { 'application/json': Sale } };
        404: { content: { 'application/json': ErrorResponse } };
      };
    };
  };
  '/api/v1/sales/{id}/cancel': {
    post: {
      parameters: {
        path: { id: string };
      };
      requestBody: {
        content: {
          'application/json': { reason?: string };
        };
      };
      responses: {
        200: { content: { 'application/json': Sale } };
        404: { content: { 'application/json': ErrorResponse } };
      };
    };
  };
  '/api/v1/customers/{id}/payments': {
    get: {
      parameters: {
        path: { id: string };
        query?: {
          start_date?: string;
          end_date?: string;
          method?: 'cash' | 'card' | 'bank' | 'other' | 'legacy';
          sort?: 'asc' | 'desc';
        };
      };
      responses: {
        200: { content: { 'application/json': CustomerPaymentsResponse } };
        404: { content: { 'application/json': ErrorResponse } };
      };
    };
    post: {
      parameters: {
        path: { id: string };
      };
      requestBody: {
        content: {
          'application/json': CustomerPaymentWrite;
        };
      };
      responses: {
        201: { content: { 'application/json': CustomerPaymentCreatedResponse } };
        400: { content: { 'application/json': ErrorResponse } };
        404: { content: { 'application/json': ErrorResponse } };
      };
    };
  };
  '/api/v1/admin/backups': {
    get: {
      responses: {
        200: { content: { 'application/json': SystemBackup[] } };
      };
    };
  };
  '/api/v1/admin/backup': {
    post: {
      responses: {
        201: { content: { 'application/json': SystemBackup } };
      };
    };
  };
  '/api/v1/admin/backup/{filename}': {
    delete: {
      parameters: {
        path: { filename: string };
      };
      responses: {
        204: unknown;
        404: { content: { 'application/json': ErrorResponse } };
      };
    };
  };
  '/api/v1/admin/restore': {
    post: {
      requestBody: {
        content: {
          'application/json': RestoreRequest;
        };
      };
      responses: {
        200: { content: { 'application/json': RestoreResponse } };
        400: { content: { 'application/json': ErrorResponse } };
        404: { content: { 'application/json': ErrorResponse } };
      };
    };
  };
  '/api/v1/admin/import/legacy/{sessionId}/status': {
    get: {
      parameters: {
        path: { sessionId: string };
      };
      responses: {
        200: { content: { 'application/json': LegacyImportStatus } };
        404: { content: { 'application/json': ErrorResponse } };
      };
    };
  };
}

type ErrorResponse = {
  message: string;
  details?: Record<string, unknown> | null;
  request_id?: string | null;
};

type LoginRequest = {
  email: string;
  password: string;
};

type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
  discountLimit: number;
};

type LoginResponse = {
  token: string;
  user: AuthenticatedUser;
};

type SaleItem = {
  id: string;
  product_id: string;
  product_name?: string | null;
  quantity: number;
  unit_price: number | null;
  total: number | null;
};

type Sale = {
  id: string;
  emission_date: string;
  order_number: string | null;
  seller_id: string | null;
  customer_id: string | null;
  payment_term_id: string | null;
  subtotal: number | null;
  discount: number | null;
  total: number | null;
  status: 'draft' | 'completed' | 'cancelled';
  source: string | null;
  source_key: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  items: SaleItem[];
};

type SaleItemWrite = {
  product_id: string;
  quantity: number;
  unit_price: number;
  total?: number | null;
};

type SaleWrite = {
  emission_date?: string;
  order_number?: string | null;
  seller_id?: string | null;
  customer_id?: string | null;
  payment_term_id?: string | null;
  subtotal?: number | null;
  discount?: number | null;
  total?: number | null;
  source?: string | null;
  source_key?: string | null;
  items: SaleItemWrite[];
};

type CustomerPayment = {
  id: string;
  amount: number;
  payment_date: string | null;
  method: 'cash' | 'card' | 'bank' | 'other' | 'legacy';
  reference: string | null;
  notes: string | null;
  received_by: string | null;
  received_by_name: string | null;
  source: 'manual' | 'legacy';
  created_at: string | null;
};

type CustomerPaymentsSummary = {
  total_debt: number;
  total_paid: number;
  current_balance: number;
  filtered_total_paid: number;
  filtered_count: number;
  applied_filters: {
    start_date?: string | null;
    end_date?: string | null;
    method?: 'cash' | 'card' | 'bank' | 'other' | 'legacy' | null;
    sort: 'asc' | 'desc';
  };
};

type CustomerPaymentsResponse = {
  payments: CustomerPayment[];
  summary: CustomerPaymentsSummary;
};

type CustomerPaymentWrite = {
  amount: number;
  payment_date?: string | null;
  method?: 'cash' | 'card' | 'bank' | 'other';
  reference?: string | null;
  notes?: string | null;
};

type CustomerPaymentCreatedResponse = {
  payment: CustomerPayment;
  summary: {
    total_debt: number;
    total_paid: number;
    previous_balance: number;
    new_balance: number;
  };
  receipt_hint: string;
};

type SystemBackup = {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  checksum: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy:
    | {
        id: string;
        fullName: string;
      }
    | null;
};

type RestoreRequest = {
  file: string;
  confirm: boolean;
  password: string;
};

type RestoreResponse = {
  status: string;
  restored: boolean;
};

type LegacyImportStatus = {
  status: string;
  overwrite: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  summary?: Record<string, unknown> | null;
  error?: string | null;
  reportAvailable: boolean;
  logs: Array<{
    level: string;
    message: string;
    createdAt: string;
  }>;
};

