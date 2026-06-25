import { redirect } from "next/navigation";
import { REPORTS, reportHref } from "./reports";

// No standalone landing yet — drop straight into the first report.
export default function ReportsPage() {
  redirect(reportHref(REPORTS[0].slug));
}
