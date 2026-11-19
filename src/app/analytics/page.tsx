import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { AnalyticsDashboard } from "@/features/analytics/analytics-dashboard";
import styles from "@/features/analytics/analytics.module.css";

export const metadata: Metadata = { title: "Analytics", description: "Live Cadinal liquidity analytics on QMS." };
export default function AnalyticsPage() {
  return <><Navbar /><main id="main-content" className={styles.page}><AnalyticsDashboard /></main></>;
}
