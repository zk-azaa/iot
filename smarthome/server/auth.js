import { supabase } from "./supabase.js";

// Mengambil user dari header "Authorization: Bearer <token login Supabase>".
// Mengembalikan null jika tidak ada token atau token tidak valid.
export async function getUserFromRequest(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) return null;

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) return null;

    return data.user;
  } catch (err) {
    console.error("[AUTH]", err.message);
    return null;
  }
}

// Middleware: wajib login
export async function requireUser(req, res, next) {
  const user = await getUserFromRequest(req);

  if (!user) {
    return res.status(401).json({ success: false, error: "Belum login." });
  }

  req.user = user;
  next();
}
