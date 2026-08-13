import type { NextFunction, Request, Response } from "express";
import { supabase, useMockDb } from "../lib/supabase.js";

export interface AuthedRequest extends Request {
  user?: { id: string; role: "admin" | "operator"; name: string; email: string };
}

/**
 * Verifies the Supabase access token in the Authorization header and loads
 * the matching row from `users` (for its role). Attaches it to req.user.
 */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (useMockDb) {
    req.user = {
      id: "dev-user",
      role: "admin",
      name: "Dev User",
      email: "dev@example.com",
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, role, name, email")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile) {
    return res.status(403).json({ error: "No app profile for this user" });
  }

  req.user = profile;
  next();
}

export function requireRole(role: "admin" | "operator") {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: `Requires ${role} role` });
    }
    next();
  };
}
