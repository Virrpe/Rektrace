import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import { createServer } from '../helpers/test-server';

describe('Health Endpoints', () => {
  let app: any;

  beforeAll(async () => {
    app = await createServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  test('GET /healthz returns 200 OK', async () => {
    const response = await request(app)
      .get('/healthz')
      .expect(200);
    
    expect(response.text).toBe('OK');
  });

  test('GET /health returns detailed health status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);
    
    expect(response.body).toHaveProperty('status');
    expect(response.body.status).toBe('healthy');
  });

  test('GET /live returns liveness probe', async () => {
    const response = await request(app)
      .get('/live')
      .expect(200);
    
    expect(response.body).toHaveProperty('alive');
    expect(response.body.alive).toBe(true);
  });

  test('GET /ready returns readiness probe', async () => {
    const response = await request(app)
      .get('/ready')
      .expect(200);
    
    expect(response.body).toHaveProperty('ready');
    expect(response.body.ready).toBe(true);
  });

  test('GET /metrics exposes prometheus metrics', async () => {
    const response = await request(app)
      .get('/metrics')
      .expect(200);
    
    expect(response.text).toContain('rektrace_');
    expect(response.headers['content-type']).toContain('text/plain');
  });
});