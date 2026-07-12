import { NextResponse } from "next/server";
import { getPipelineMeta, getPipelineJobSource, getPipelineJob } from "@/lib/data-access";

/**
 * GET /api/pipeline
 * Returns the list of pipeline jobs (lineage metadata).
 *
 * GET /api/pipeline?jobId=AvgStockVolumePerMonth
 * Returns the full metadata for that job PLUS the source code of the
 * original MapReduce/Spark files from code_repo.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ jobs: getPipelineMeta() });
  }
  const job = getPipelineJob(jobId);
  if (!job) {
    return NextResponse.json({ error: `unknown job: ${jobId}` }, { status: 404 });
  }
  const sources = getPipelineJobSource(jobId);
  return NextResponse.json({ job, sources });
}
