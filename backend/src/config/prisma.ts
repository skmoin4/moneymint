import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Default pg.Pool size is 10 — too tight once many recharges land concurrently (each
// holds a connection for the duration of its $transaction). 20 gives real headroom
// without exhausting Postgres's own default max_connections (100).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 20 });

export const prisma = new PrismaClient({ adapter });
