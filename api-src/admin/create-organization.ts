import type { VercelRequest, VercelResponse } from "@vercel/node";
import { httpErrorStatus, readJsonBody, requireSuperadmin } from "../shared/auth";
import { createOrganizationWithAdmin } from "../shared/organizations";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireSuperadmin(req.headers.authorization);
    const body = readJsonBody(req.body);
    const result = await createOrganizationWithAdmin({
      name: String(body.name || ""),
      slug: String(body.slug || ""),
      adminName: String(body.adminName || ""),
      adminEmail: String(body.adminEmail || ""),
      adminPassword: String(body.adminPassword || ""),
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Falha ao criar organização.";
    console.error("admin/create-organization:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
