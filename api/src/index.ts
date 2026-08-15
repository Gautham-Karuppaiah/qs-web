import express from "express";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL;
if (!supabaseUrl) throw new Error("missing SUPABASE_URL");

const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!publishableKey) throw new Error("missing SUPABASE_PUBLISHABLE_KEY");

const bucket = process.env.S3_BUCKET;
if (!bucket) throw new Error("missing S3_BUCKET");

const MAX_BYTES = 100 * 1024 * 1024;

const app = express();
const jwks = createRemoteJWKSet(
  new URL("/auth/v1/.well-known/jwks.json", supabaseUrl),
);
const s3 = new S3Client({ region: process.env.AWS_REGION });

app.use(
  cors({
    origin: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173").split(","),
  }),
);
app.use(express.json());

const requireAuth = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  const header = req.headers.authorization;
  if (!header) {
    res.status(401).json({ error: "no token" });
    return;
  }
  try {
    const { payload } = await jwtVerify(header.split(" ")[1], jwks, {
      issuer: supabaseUrl + "/auth/v1",
      audience: "authenticated",
    });
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "bad token" });
  }
};

const dbFor = (req: express.Request) =>
  createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: req.headers.authorization! } },
  });

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/me", requireAuth, (req, res) => {
  res.json({ userId: req.userId });
});

const uuid = z.uuid();

app.get("/projects/:projectId/drawings", requireAuth, async (req, res) => {
  const projectId = uuid.safeParse(req.params.projectId);
  if (!projectId.success) {
    res.status(400).json({ error: "invalid projectId" });
    return;
  }
  const db = dbFor(req);
  const { data, error } = await db
    .from("drawings")
    .select()
    .eq("project_id", projectId.data);
  if (error) {
    console.error(error);
    res.status(500).json({ error: "query failed" });
    return;
  }
  res.json(data);
});

const createBody = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_BYTES),
});

app.post("/projects/:projectId/drawings", requireAuth, async (req, res) => {
  const projectId = uuid.safeParse(req.params.projectId);
  if (!projectId.success) {
    res.status(400).json({ error: "invalid projectId" });
    return;
  }
  const body = createBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid body" });
    return;
  }

  const db = dbFor(req);
  const project = await db
    .from("projects")
    .select("id, org_id")
    .eq("id", projectId.data)
    .maybeSingle();
  if (project.error) {
    console.error(project.error);
    res.status(500).json({ error: "query failed" });
    return;
  }
  if (!project.data) {
    res.status(404).json({ error: "no such project" });
    return;
  }

  const id = crypto.randomUUID();
  const s3Key = `orgs/${project.data.org_id}/projects/${project.data.id}/${id}.pdf`;

  const { data, error } = await db
    .from("drawings")
    .insert({
      id,
      project_id: project.data.id,
      org_id: project.data.org_id,
      name: body.data.name,
      s3_key: s3Key,
      created_by: req.userId,
    })
    .select()
    .single();
  if (error) {
    console.error(error);
    res.status(500).json({ error: "insert failed" });
    return;
  }

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      ContentType: "application/pdf",
      ContentLength: body.data.size,
    }),
    { expiresIn: 900 },
  );

  res.status(201).json({ drawing: data, uploadUrl });
});

app.post("/drawings/:drawingId/complete", requireAuth, async (req, res) => {
  const drawingId = uuid.safeParse(req.params.drawingId);
  if (!drawingId.success) {
    res.status(400).json({ error: "invalid drawingId" });
    return;
  }

  const db = dbFor(req);
  const drawing = await db
    .from("drawings")
    .select()
    .eq("id", drawingId.data)
    .maybeSingle();
  if (drawing.error) {
    console.error(drawing.error);
    res.status(500).json({ error: "query failed" });
    return;
  }
  if (!drawing.data) {
    res.status(404).json({ error: "no such drawing" });
    return;
  }

  let size: number;
  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: drawing.data.s3_key }),
    );
    size = head.ContentLength ?? 0;
  } catch {
    res.status(400).json({ error: "nothing uploaded" });
    return;
  }

  if (size === 0 || size > MAX_BYTES) {
    await s3.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: drawing.data.s3_key }),
    );
    await db
      .from("drawings")
      .update({ status: "failed" })
      .eq("id", drawing.data.id);
    res.status(400).json({ error: "bad size" });
    return;
  }

  const { data, error } = await db
    .from("drawings")
    .update({ status: "ready", size_bytes: size })
    .eq("id", drawing.data.id)
    .select()
    .single();
  if (error) {
    console.error(error);
    res.status(500).json({ error: "update failed" });
    return;
  }
  res.json(data);
});

app.get("/drawings/:drawingId/url", requireAuth, async (req, res) => {
  const drawingId = uuid.safeParse(req.params.drawingId);
  if (!drawingId.success) {
    res.status(400).json({ error: "invalid drawingId" });
    return;
  }

  const db = dbFor(req);
  const { data, error } = await db
    .from("drawings")
    .select()
    .eq("id", drawingId.data)
    .maybeSingle();
  if (error) {
    console.error(error);
    res.status(500).json({ error: "query failed" });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "no such drawing" });
    return;
  }
  if (data.status !== "ready") {
    res.status(409).json({ error: "not ready" });
    return;
  }

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: data.s3_key }),
    { expiresIn: 300 },
  );
  res.json({ url, drawing: data });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`working on port ${port}`));
