import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import router       from "./routes";
import totemPageRouter from "./routes/totemPage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve static frontend in dev/local; in production Replit platform handles static routing
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// Totem SPA — URL única por condomínio (ANTES do catch-all)
app.use("/totem", totemPageRouter);

// Assets do concierge (sem autenticação)
app.use("/concierge/assets", express.static(path.join(publicDir, "concierge", "assets")));

app.get(/^(?!\/api)(?!\/totem).*$/, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

export default app;
