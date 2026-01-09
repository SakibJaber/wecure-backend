import { MongooseModuleOptions } from '@nestjs/mongoose';

export const databaseConfig = (): MongooseModuleOptions => ({
  uri: process.env.MONGODB_URI,
  autoIndex: false, // important for production
  retryAttempts: 5,
  retryDelay: 3000,
});
