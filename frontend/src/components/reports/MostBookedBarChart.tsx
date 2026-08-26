import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MostBookedItem } from "../../lib/reports";
import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion";

interface ChartDatum extends MostBookedItem {
  label: string;
}

function MostBookedTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartDatum }[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <Link to={`/items/${item.item_id}`} className="chart-tooltip-title">
        {item.item_code} — {item.name}
      </Link>
      <p>
        {item.booking_count} booking{item.booking_count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

// "Popular" means more than one booking — a single booking isn't a
// pattern yet, per explicit direction. The full ranking (including
// once-booked items) still lives in the table below this chart; this is
// deliberately the narrower "what's genuinely trending" view, not a
// second copy of the same complete list.
export function MostBookedBarChart({ items }: { items: MostBookedItem[] }) {
  const reducedMotion = usePrefersReducedMotion();
  const popular = items.filter((i) => i.booking_count > 1).sort((a, b) => b.booking_count - a.booking_count);
  if (popular.length === 0) return null;

  const chartData: ChartDatum[] = popular.map((i) => ({ ...i, label: i.item_code }));
  // Widens with the number of bars rather than squeezing every bar
  // unreadably thin once there are many — .bar-chart-scroll then lets the
  // container scroll horizontally, same rule this app already applies to
  // wide tables.
  const width = Math.max(chartData.length * 76, 320);

  return (
    <div className="bar-chart-scroll">
      <div style={{ width, height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="mostBookedBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--wine)" />
                <stop offset="100%" stopColor="var(--wine-strong)" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: "var(--ink-soft)" }}
              axisLine={{ stroke: "var(--line)" }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: "var(--ink-soft)" }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip content={<MostBookedTooltip />} cursor={{ fill: "var(--wine-soft)" }} />
            <Bar
              dataKey="booking_count"
              fill="url(#mostBookedBarGradient)"
              radius={[8, 8, 0, 0]}
              maxBarSize={48}
              isAnimationActive={!reducedMotion}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
