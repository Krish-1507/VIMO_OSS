/**
 * Robust External Connection Service
 * 
 * Provides production-grade HTTP connections to external APIs with:
 * - Exponential backoff retry with jitter
 * - Circuit breaker pattern
 * - Token refresh on 401 responses
 * - Request/response logging
 * - Rate limit handling
 * - Timeout management
 * - Health monitoring
 */
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatuses: number[];
  retryableMethods: string[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenMaxRequests: number;
}

export interface ConnectionHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastSuccess: Date | null;
  lastFailure: Date | null;
  consecutiveFailures: number;
  totalRequests: number;
  totalFailures: number;
  averageLatency: number;
  circuitState: CircuitState;
}

type CircuitState = 'closed' | 'open' | 'half-open';

export interface ConnectionMetrics {
  provider: string;
  requestsTotal: number;
  requestsFailed: number;
  retryCount: number;
  circuitBreakerOpens: number;
  avgLatencyMs: number;
  lastHealthCheck: Date;
}

/* ================================================================== */
/*  Default Configurations                                             */
/* ================================================================== */

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT'],
};

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 30000,
  halfOpenMaxRequests: 3,
};

/* ================================================================== */
/*  Circuit Breaker                                                      */
/* ================================================================== */

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime: number = 0;
  private halfOpenRequests = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  canExecute(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
        this.state = 'half-open';
        this.halfOpenRequests = 0;
        return true;
      }
      return false;
    }
    if (this.state === 'half-open') {
      return this.halfOpenRequests < this.config.halfOpenMaxRequests;
    }
    return false;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

/* ================================================================== */
/*  Retry Logic with Exponential Backoff & Jitter                      */
/* ================================================================== */

function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelay * Math.pow(2, attempt);
  const withJitter = exponential * (0.5 + Math.random() * 0.5);
  return Math.min(withJitter, config.maxDelay);
}

function shouldRetry(error: AxiosError, config: RetryConfig): boolean {
  if (!error.response) return true; // Network errors are retryable
  
  const status = error.response.status;
  if (!config.retryableStatuses.includes(status)) return false;
  
  const method = error.config?.method?.toUpperCase();
  if (method && !config.retryableMethods.includes(method)) return false;
  
  return true;
}

/* ================================================================== */
/*  Connection Manager                                                   */
/* ================================================================== */

interface TokenRefreshConfig {
  refreshFn: () => Promise<string>;
  onRefresh: (newToken: string) => void;
  isTokenExpiredError?: (error: AxiosError) => boolean;
}

export class ExternalConnection {
  private client: AxiosInstance;
  private retryConfig: RetryConfig;
  private circuitBreaker: CircuitBreaker;
  private health: ConnectionHealth;
  private metrics: ConnectionMetrics;
  private tokenRefreshConfig?: TokenRefreshConfig;
  private requestLog: Array<{ timestamp: Date; method: string; url: string; status: number; latency: number }> = [];
  private readonly maxLogSize = 1000;

  constructor(
    private providerName: string,
    private baseURL: string,
    config: Partial<{
      timeout: number;
      headers: Record<string, string>;
      retryConfig: Partial<RetryConfig>;
      circuitBreakerConfig: Partial<CircuitBreakerConfig>;
      tokenRefresh: TokenRefreshConfig;
    }> = {}
  ) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retryConfig };
    this.circuitBreaker = new CircuitBreaker(config.circuitBreakerConfig);
    this.tokenRefreshConfig = config.tokenRefresh;

    this.health = {
      status: 'healthy',
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0,
      totalRequests: 0,
      totalFailures: 0,
      averageLatency: 0,
      circuitState: 'closed',
    };

    this.metrics = {
      provider: providerName,
      requestsTotal: 0,
      requestsFailed: 0,
      retryCount: 0,
      circuitBreakerOpens: 0,
      avgLatencyMs: 0,
      lastHealthCheck: new Date(),
    };

    this.client = axios.create({
      baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Response interceptor for auto-retry on failure
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retryCount?: number };
        
        if (!originalRequest) return Promise.reject(error);

        originalRequest._retryCount = originalRequest._retryCount || 0;

        // Check for token expiration and attempt refresh
        if (this.tokenRefreshConfig && this.isTokenExpired(error)) {
          try {
            const newToken = await this.tokenRefreshConfig.refreshFn();
            this.tokenRefreshConfig.onRefresh(newToken);
            
            // Update authorization header and retry
            if (!originalRequest.headers) originalRequest.headers = {};
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            
            return this.client(originalRequest);
          } catch (refreshError) {
            return Promise.reject(refreshError);
          }
        }

        // Retry logic
        if (
          shouldRetry(error, this.retryConfig) &&
          originalRequest._retryCount < this.retryConfig.maxRetries
        ) {
          originalRequest._retryCount++;
          this.metrics.retryCount++;
          
          const delay = calculateDelay(originalRequest._retryCount - 1, this.retryConfig);
          await this.sleep(delay);
          
          return this.client(originalRequest);
        }

        return Promise.reject(error);
      }
    );
  }

  private isTokenExpired(error: AxiosError): boolean {
    if (this.tokenRefreshConfig?.isTokenExpiredError) {
      return this.tokenRefreshConfig.isTokenExpiredError(error);
    }
    return error.response?.status === 401;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private logRequest(method: string, url: string, status: number, latency: number): void {
    this.requestLog.push({ timestamp: new Date(), method, url, status, latency });
    if (this.requestLog.length > this.maxLogSize) {
      this.requestLog.shift();
    }
  }

  private updateHealth(success: boolean, latency: number): void {
    this.health.totalRequests++;
    this.metrics.requestsTotal++;
    this.health.circuitState = this.circuitBreaker.getState();

    if (success) {
      this.health.lastSuccess = new Date();
      this.health.consecutiveFailures = 0;
      this.health.status = 'healthy';
      this.circuitBreaker.recordSuccess();
      
      // Update average latency
      const prevAvg = this.health.averageLatency;
      const count = this.health.totalRequests;
      this.health.averageLatency = (prevAvg * (count - 1) + latency) / count;
    } else {
      this.health.lastFailure = new Date();
      this.health.consecutiveFailures++;
      this.metrics.requestsFailed++;
      this.circuitBreaker.recordFailure();

      if (this.health.consecutiveFailures >= 3) {
        this.health.status = 'degraded';
      }
      if (this.health.consecutiveFailures >= 5) {
        this.health.status = 'unhealthy';
      }
    }

    this.metrics.avgLatencyMs = this.health.averageLatency;
  }

  async request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    if (!this.circuitBreaker.canExecute()) {
      this.metrics.circuitBreakerOpens++;
      throw new Error(`Circuit breaker is OPEN for ${this.providerName}. Service temporarily unavailable.`);
    }

    const startTime = Date.now();
    
    try {
      const response = await this.client.request<T>(config);
      const latency = Date.now() - startTime;
      
      this.updateHealth(true, latency);
      this.logRequest(config.method || 'GET', config.url || '', response.status, latency);
      
      return response;
    } catch (error) {
      const latency = Date.now() - startTime;
      const axiosError = error as AxiosError;
      
      this.updateHealth(false, latency);
      this.logRequest(
        config.method || 'GET',
        config.url || '',
        axiosError.response?.status || 0,
        latency
      );

      throw error;
    }
  }

  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  async post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  async put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  getHealth(): ConnectionHealth {
    return { ...this.health, circuitState: this.circuitBreaker.getState() };
  }

  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  getRecentLogs(limit: number = 100): Array<{ timestamp: Date; method: string; url: string; status: number; latency: number }> {
    return this.requestLog.slice(-limit);
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker = new CircuitBreaker();
  }
}

/* ================================================================== */
/*  Connection Registry (Singleton)                                      */
/* ================================================================== */

class ConnectionRegistry {
  private connections = new Map<string, ExternalConnection>();

  register(name: string, connection: ExternalConnection): void {
    this.connections.set(name, connection);
  }

  get(name: string): ExternalConnection | undefined {
    return this.connections.get(name);
  }

  has(name: string): boolean {
    return this.connections.has(name);
  }

  remove(name: string): void {
    this.connections.delete(name);
  }

  getAllHealth(): Record<string, ConnectionHealth> {
    const health: Record<string, ConnectionHealth> = {};
    for (const [name, conn] of this.connections) {
      health[name] = conn.getHealth();
    }
    return health;
  }

  getAllMetrics(): Record<string, ConnectionMetrics> {
    const metrics: Record<string, ConnectionMetrics> = {};
    for (const [name, conn] of this.connections) {
      metrics[name] = conn.getMetrics();
    }
    return metrics;
  }
}

export const connectionRegistry = new ConnectionRegistry();

/* ================================================================== */
/*  Factory Functions                                                    */
/* ================================================================== */

export function createExternalConnection(
  providerName: string,
  baseURL: string,
  config?: ConstructorParameters<typeof ExternalConnection>[2]
): ExternalConnection {
  const connection = new ExternalConnection(providerName, baseURL, config);
  connectionRegistry.register(providerName, connection);
  return connection;
}

export default ExternalConnection;
