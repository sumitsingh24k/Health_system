import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI;

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

function toDatabaseError(error) {
  const reason = error instanceof Error ? error.message : "Unknown DB connection error";
  if (reason.startsWith("Database connection failed:")) {
    return new Error(reason);
  }
  const normalized = reason.toLowerCase();

  if (
    normalized.includes("etimedout") ||
    normalized.includes("server selection timed out") ||
    normalized.includes("econnrefused") ||
    normalized.includes("enotfound")
  ) {
    return new Error(
      `Database connection failed: ${reason}. Check MONGO_URI and allow network access to MongoDB/Atlas (including IP allowlist).`
    );
  }

  if (
    normalized.includes("authentication failed") ||
    normalized.includes("auth failed") ||
    normalized.includes("bad auth")
  ) {
    return new Error(
      `Database connection failed: ${reason}. Verify MongoDB username/password in MONGO_URI.`
    );
  }

  return new Error(`Database connection failed: ${reason}`);
}

export default async function dbConnect() {
  if (!MONGO_URI) {
    throw new Error("Database connection failed: MONGO_URI is missing from environment variables.");
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 20000,
        maxPoolSize: 10,
        minPoolSize: 0,
      })
      .then((mongooseInstance) => {
        return mongooseInstance;
      })
      .catch((error) => {
        cached.promise = null;
        throw toDatabaseError(error);
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    throw toDatabaseError(error);
  }
}



