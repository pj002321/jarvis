import os from "node:os";
import { recommendModels } from "@/lib/localModels";

export async function GET() {
  const totalMemGB = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  const cpu = os.cpus()[0]?.model ?? "Unknown CPU";
  return Response.json({ totalMemGB, cpu, recommended: recommendModels(totalMemGB) });
}
