import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatTrendBucketLabel } from "../../lib/dates";
import type { RevenueTrend } from "../../lib/reports";
import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion";

interface ChartDatum {
  bucket: string;
  revenue: number;
  label: string;
}

function RevenueTrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartDatum }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">{point.label}</p>
      <p>₹{point.revenue}</p>
    </div>
  );
}

// A "growth" view alongside the plain Bookings This Period stat tiles —
// bucket size (day/week/month/year) is whatever the backend picked for
// the resolved [from, to] span (see getRevenueTrend), never computed
// here; this only formats the label for whatever bucket it's already
// given.
export function RevenueTrendChart({ trend }: { trend: RevenueTrend }) {
  const reducedMotion = usePrefersReducedMotion();
  if (trend.points.length === 0) return null;

  const chartData: ChartDatum[] = trend.points.map((p) => ({
    ...p,
    label: formatTrendBucketLabel(p.bucket, trend.granularity),
  }));

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="revenueTrendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--wine)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--wine)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "var(--ink-soft)" }}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => `₹${v}`}
            tick={{ fontSize: 12, fill: "var(--ink-soft)" }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip content={<RevenueTrendTooltip />} cursor={{ stroke: "var(--wine)", strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--wine)"
            strokeWidth={2.5}
            fill="url(#revenueTrendGradient)"
            dot={false}
            isAnimationActive={!reducedMotion}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
