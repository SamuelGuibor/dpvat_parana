/* eslint-disable @typescript-eslint/no-explicit-any */
export async function runWindmillJob(
  jobPath: string,
  payload: any
) {
  const response = await fetch(
    `https://app.windmill.dev/api/w/parana-seguros/jobs/run_wait_result/${jobPath}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WINDMILL_TOKEN}`,
      },
      body: JSON.stringify(payload),
    }
  );

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Windmill error: ${raw}`);
  }

  return JSON.parse(raw);
}
