import "dotenv/config";
import { spawn } from "node:child_process";
const database = new URL(process.env.DATABASE_URL);
database.pathname = "/biomap_v15_qa";
process.env.DATABASE_URL = database.toString();
process.env.BIOMAP_WORKSPACE_KIND = "preview";
process.env.BIOMAP_WORKSPACE_NAME = "BioMapOS V18 QA";
// Local-only QA uses the existing development server; production HTTPS rules remain intact.
process.env.NODE_ENV = "development";
process.env.PUBLIC_BASE_URL = "http://127.0.0.1:3115";
process.env.PORT = "3000";
const server = spawn("npm", ["run", "dev", "--", "--host", "0.0.0.0"], { stdio: "inherit", env: process.env });
process.on("SIGTERM", () => server.kill("SIGTERM"));
server.on("exit", code => process.exit(code ?? 1));
