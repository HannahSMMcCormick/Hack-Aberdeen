const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "candidate";
};

export type Assessment = {
  id: string;
  title: string;
  role: string;
  description: string | null;
  criteria: Record<string, unknown>;
  status: string;
  created_at: string;
};

export async function login(email: string, password: string) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error("Invalid email or password");
  }

  return (await response.json()) as {
    access_token: string;
    token_type: string;
  };
}

export async function getCurrentUser(token: string): Promise<User> {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load user profile");
  }

  return response.json();
}

export async function getAssessments(
  token: string
): Promise<Assessment[]> {
  const response = await fetch(`${API_URL}/assessments`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load assessments");
  }

  return response.json();
}


export type AssessmentCreate = {
  title: string;
  role: string;
  description: string | null;
  criteria: Record<string, unknown>;
};

export async function createAssessment(
  token: string,
  data: AssessmentCreate
): Promise<Assessment> {
  const response = await fetch(`${API_URL}/assessments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("You are not authorized to create assessments.");
    }

    throw new Error("Failed to create assessment.");
  }

  return response.json();
}


export type AssessmentUpdate = {
  title?: string;
  role?: string;
  description?: string | null;
  criteria?: Record<string, unknown>;
  status?: "draft" | "published";
};

export async function updateAssessment(
  token: string,
  id: string,
  data: AssessmentUpdate
): Promise<Assessment> {
  const response = await fetch(
    `${API_URL}/assessments/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to update assessment (${response.status}).`);
  }

  return response.json();
}

export async function deleteAssessment(
  token: string,
  id: string
): Promise<void> {
  const response = await fetch(
    `${API_URL}/assessments/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete assessment (${response.status}).`);
  }
}
