
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAssessment } from "@/lib/api";

export default function NewAssessmentPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [competencies, setCompetencies] = useState("");
  const [difficulty, setDifficulty] = useState("junior");
  const [duration, setDuration] = useState(45);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");

    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    const competencyList = competencies
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (competencyList.length === 0) {
      setError("Enter at least one competency.");
      return;
    }

    setLoading(true);

    try {
      await createAssessment(token, {
        title: title.trim(),
        role: role.trim(),
        description: description.trim() || null,
        criteria: {
          competencies: competencyList,
          difficulty,
          duration_minutes: duration,
        },
      });

      router.push("/admin");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="mb-6 text-sm text-blue-700 hover:underline"
        >
          ← Back to dashboard
        </button>

        <div className="rounded-xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold">
            Create Assessment
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Configure a new technical interview assessment.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="title" className="mb-1 block text-sm font-medium">
                Assessment title
              </label>
              <input
                id="title"
                required
                maxLength={255}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Junior Full Stack Developer Interview"
                className="w-full rounded-lg border p-3"
              />
            </div>

            <div>
              <label htmlFor="role" className="mb-1 block text-sm font-medium">
                Job role
              </label>
              <input
                id="role"
                required
                maxLength={255}
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="Full Stack Developer"
                className="w-full rounded-lg border p-3"
              />
            </div>

            <div>
              <label htmlFor="description" className="mb-1 block text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the skills being assessed..."
                className="w-full rounded-lg border p-3"
              />
            </div>

            <div>
              <label htmlFor="competencies" className="mb-1 block text-sm font-medium">
                Competencies
              </label>
              <input
                id="competencies"
                required
                value={competencies}
                onChange={(event) => setCompetencies(event.target.value)}
                placeholder="React, TypeScript, Python, SQL"
                className="w-full rounded-lg border p-3"
              />
              <p className="mt-1 text-xs text-slate-500">
                Separate competencies with commas.
              </p>
            </div>

            <div>
              <label htmlFor="difficulty" className="mb-1 block text-sm font-medium">
                Difficulty
              </label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
                className="w-full rounded-lg border p-3"
              >
                <option value="junior">Junior</option>
                <option value="mid">Mid-level</option>
                <option value="senior">Senior</option>
              </select>
            </div>

            <div>
              <label htmlFor="duration" className="mb-1 block text-sm font-medium">
                Interview duration (minutes)
              </label>
              <input
                id="duration"
                type="number"
                min={10}
                max={180}
                required
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                className="w-full rounded-lg border p-3"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Assessment"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/admin")}
                className="rounded-lg border px-5 py-3 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
