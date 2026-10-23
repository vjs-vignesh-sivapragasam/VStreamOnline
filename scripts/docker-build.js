import { execSync } from "child_process";
import dotenv from "dotenv";

dotenv.config();

const cmd = `docker buildx build \
--tag vjdev1212/tmv:latest \
--platform linux/arm64,linux/amd64,linux/arm/v7 \
--push .`;

console.log(`🚀 Running: ${cmd}`);
execSync(cmd, { stdio: "inherit" });
