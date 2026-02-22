import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config(); // Carga variables de .env

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'stellara_test',
  synchronize: false, // ¡Obligatorio en false para usar migraciones!
  logging: process.env.NODE_ENV === 'development',
  entities: ['src/**/*.entity{.ts,.js}'],
  migrations: ['src/database/migrations/*{.ts,.js}'],
});
