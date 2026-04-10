import { logServerError } from "@/app/lib/server-log";

let bcryptModulePromise = null;

async function loadBcrypt() {
  if (!bcryptModulePromise) {
    bcryptModulePromise = import("bcrypt")
      .then((mod) => mod.default || mod)
      .catch((error) => {
        bcryptModulePromise = null;
        logServerError("auth/load-bcrypt", error);
        throw new Error(
          "Password module failed to load. Reinstall dependencies (`npm install`) and restart the server."
        );
      });
  }

  return bcryptModulePromise;
}

export async function hashPassword(password, saltRounds = 10) {
  const bcrypt = await loadBcrypt();
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password, hash) {
  const bcrypt = await loadBcrypt();
  return bcrypt.compare(password, hash);
}
