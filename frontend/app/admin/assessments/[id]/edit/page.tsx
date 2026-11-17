
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getAssessments,
  updateAssessment,
  type Assessment,
} from "@/lib/api";

export default function EditAssessmentPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [competencies, setCompetencies] = useState("");
  const [difficulty, setDifficulty] = useState("junior");
  const [duration, setDuration] = useState(45);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = sessionStorage.getItem("access_token");

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const assessments = await getAssessments(token);
        const found = assessments.find((item) => item.id === id);

        if (!found) throw new Error("Assessment not found.");

        if (cancelled) return;

        setAssessment(found);
        setTitle(found.title);
        setRole(found.role);
        setDescription(found.description ?? "");

        const criteria = found.criteria;
        const skills = Array.isArray(criteria.competencies)
          ? criteria.competencies.filter(
              (skill): skill is string => typeof skill === "string"
            )
          : [];

        setCompetencies(skills.join(", "));
        setDifficulty(
          typeof criteria.difficulty === "string"
            ? criteria.difficulty
            : "junior"
        );
        setDuration(
          typeof criteria.duration_minutes === "number"
            ? criteria.duration_minutes
            : 45
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load assessment."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    const skills = competencies
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);

    if (skills.length === 0) {
      setError("Enter at least one competency.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await updateAssessment(token, id, {
        title: title.trim(),
        role: role.trim(),
        description: description.trim() || null,
        criteria: {
          ...(assessment?.criteria ?? {}),
          competencies: skills,
          difficulty,
          duration_minutes: duration,
        },
      });

      router.push("/admin");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save assessment."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="p-8">Loading assessment...</main>;
  }

  if (!assessment) {
    return (
      <main className="p-8">
        <p role="alert" className="text-red-600">{error}</p>
        <button
          onClick={() => router.push("/admin")}
          className="mt-4 underline"
        >
          Back to dashboard
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => router.push("/admin")}
          className="mb-6 text-blue-700 hover:underline"
        >
          ← Back to dashboard
        </button>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-xl bg-white p-8 shadow-sm"
        >
          <h1 className="text-2xl font-bold">Edit Assessment</h1>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Title</span>
            <input
              required
              maxLength={255}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border p-3"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Job role</span>
            <input
              required
              maxLength={255}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border p-3"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              Description
            </span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border p-3"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              Competencies (comma-separated)
            </span>
            <input
              required
              value={competencies}
              onChange={(e) => setCompetencies(e.target.value)}
              className="w-full rounded-lg border p-3"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              Difficulty
            </span>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full rounded-lg border p-3"
            >
              <option value="junior">Junior</option>
              <option value="mid">Mid-level</option>
              <option value="senior">Senior</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              Duration (minutes)
            </span>
            <input
              type="number"
              min={10}
              max={180}
              required
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-lg border p-3"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-3 text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </main>
  );
}
