"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

interface WeekPoint {
  week: string;
  position: number | null;
  clicks: number;
}

interface ArticleSeries {
  id: string;
  title: string;
  weeks: WeekPoint[];
}

interface Props {
  data: ArticleSeries[];
}

const COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6",
  "#a855f7", "#14b8a6", "#f97316",
];

export default function AssessmentCharts({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
        No assessment data yet.
      </div>
    );
  }

  // Build a unified week-indexed dataset for the position chart
  const allWeeks = Array.from(
    new Set(data.flatMap((s) => s.weeks.map((w) => w.week)))
  ).sort();

  const positionChartData = allWeeks.map((week) => {
    const row: Record<string, string | number | null> = { week };
    for (const series of data) {
      const point = series.weeks.find((w) => w.week === week);
      row[series.title.slice(0, 30)] = point?.position ?? null;
    }
    return row;
  });

  const clicksChartData = allWeeks.map((week) => {
    const row: Record<string, string | number | null> = { week };
    for (const series of data) {
      const point = series.weeks.find((w) => w.week === week);
      row[series.title.slice(0, 30)] = point?.clicks ?? null;
    }
    return row;
  });

  const seriesKeys = data.map((s) => s.title.slice(0, 30));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* SERP Position Delta */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">SERP Position (lower = better)</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={positionChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis reversed tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {seriesKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[i % COLORS.length]}
                dot={false}
                strokeWidth={2}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Weekly Clicks Delta */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Weekly Clicks</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={clicksChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {seriesKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[i % COLORS.length]}
                dot={false}
                strokeWidth={2}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
