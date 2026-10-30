import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const { webhookUrl, bookingData } = req.body;
  if (!webhookUrl) return res.status(400).json({ message: "Missing webhookUrl" });
  await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bookingData) });
  return res.status(200).json({ success: true });
}
