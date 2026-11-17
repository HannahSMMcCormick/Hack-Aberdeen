
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, getCurrentUser } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Authenticate with FastAPI
      const result = await login(email, password);

      // Get the authenticated user's role
      const user = await getCurrentUser(result.access_token);

      // Store the JWT for subsequent API requests
      sessionStorage.setItem(
        "access_token",
        result.access_token
      );

      // Redirect based on role
      if (user.role === "admin") {
        router.replace("/admin");
      } else if (user.role === "candidate") {
        router.replace("/candidate");
      } else {
        sessionStorage.removeItem("access_token");
        throw new Error("Unsupported account role.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Login failed. Check your email and password."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-xl bg-white p-8 shadow-xl"
      >
        <h1 className="text-2xl font-bold text-slate-900">
          PersonifyInterview
        </h1>

        <p className="text-sm text-slate-600">
          Sign in to your account
        </p>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-700"
          >
            Email
          </label>

          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border p-3 text-slate-900"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700"
          >
            Password
          </label>

          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border p-3 text-slate-900"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-600"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 p-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
