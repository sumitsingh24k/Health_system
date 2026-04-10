import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import dbConnect from "@/app/lib/dbconnect";
import User from "@/app/lib/schema/userschema";

if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = `http://localhost:${process.env.PORT || "3000"}`;
}

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
if (!NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET (or AUTH_SECRET) must be set");
}

const STATIC_ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const STATIC_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const STATIC_ADMIN_ID = "000000000000000000000001";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Login ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const loginId = credentials?.username?.trim();
        const password = credentials?.password;

        if (!loginId || !password) {
          throw new Error("Login ID and password are required");
        }

        if (loginId === STATIC_ADMIN_USERNAME && password === STATIC_ADMIN_PASSWORD) {
          return {
            id: STATIC_ADMIN_ID,
            name: "System Admin",
            email: "admin@local.healthsystem",
            role: "ADMIN",
            status: "APPROVED",
            location: null,
            workerId: null,
          };
        }

        await dbConnect();

        const normalizedEmail = loginId.toLowerCase();
        const normalizedWorkerId = loginId.toUpperCase();

        const user = await User.findOne({
          $or: [{ email: normalizedEmail }, { workerId: normalizedWorkerId }],
        });

        if (!user) {
          throw new Error("Invalid credentials");
        }

        const isPasswordValid = await bcrypt.compare(
          password,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error("Invalid credentials");
        }

        if (
          (user.role === "HOSPITAL" || user.role === "MEDICAL") &&
          user.status !== "APPROVED"
        ) {
          throw new Error("Account is pending admin approval");
        }

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          location: user.location || null,
          workerId: user.role === "ASHA" ? user.workerId || null : null,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
        token.location = user.location || null;
        token.workerId = user.workerId || null;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.status = token.status;
        session.user.location = token.location || null;
        session.user.workerId = token.workerId || null;
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: NEXTAUTH_SECRET,
};
