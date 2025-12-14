import { sql } from '@vercel/postgres';

// Database client wrapper
export const db = {
  query: async <T = any>(query: string, params?: any[]): Promise<T[]> => {
    const result = await sql.query(query, params);
    return result.rows as T[];
  },

  queryOne: async <T = any>(query: string, params?: any[]): Promise<T | null> => {
    const result = await sql.query(query, params);
    return result.rows[0] as T || null;
  },

  execute: async (query: string, params?: any[]): Promise<void> => {
    await sql.query(query, params);
  },
};

export default db;
