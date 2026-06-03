"use server";

import { querySlpr } from "@/lib/slpr-mysql";

export type SlprCarEventRow = {
  id: number;
  plate: string;
  eventTime: string;
  status: string;
  cameraId: number | null;
  duration: string | null;
  imagePath: string | null;
  customerId: number | null;
};

type SlprRawLogRow = {
  ID: string | null;
  LP: string | null;
  LOG_DATE: string | null;
  STATUS: string | null;
  CAM_ID: string | null;
  DURATION: string | null;
  FILE: string | null;
  Customer_Id: string | null;
};

function parseNullableNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getRecentCarEvents(
  limit: number = 100
): Promise<SlprCarEventRow[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = await querySlpr<SlprRawLogRow>(
    `SELECT ID, LP, LOG_DATE, STATUS, CAM_ID, DURATION, FILE, Customer_Id
     FROM \`log\`
     WHERE CAM_ID = 1
     ORDER BY LOG_DATE DESC, ID DESC
     LIMIT ${safeLimit}`
  );

  return rows.map((row) => ({
    id: parseNullableNumber(row.ID) ?? 0,
    plate: (row.LP ?? "").trim(),
    eventTime: row.LOG_DATE ?? "",
    status: row.STATUS ?? "",
    cameraId: parseNullableNumber(row.CAM_ID),
    duration: row.DURATION,
    imagePath: row.FILE,
    customerId: parseNullableNumber(row.Customer_Id),
  }));
}
