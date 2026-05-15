import mongoose from 'mongoose';

// Cached connection — prevents multiple connections on hot reload
declare global {
  var _mongooseCache: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } | undefined;
}

let cached = global._mongooseCache;

if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

export async function connectDB() {
  const MONGODB_URI = process.env.MONGODB_URI!;

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in .env.local');
  }

  // Ensure cached is never undefined via assertion pointer for TS narrowing
  const activeCache = cached!;

  if (activeCache.conn) return activeCache.conn;

  if (!activeCache.promise) {
    activeCache.promise = mongoose
      .connect(MONGODB_URI, { bufferCommands: false })
      .then((m) => m);
  }

  activeCache.conn = await activeCache.promise;
  return activeCache.conn;
}
