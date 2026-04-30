import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-8 h-14">
          <span className="font-bold text-gray-900 text-sm tracking-tight">SEO/GEO Pipeline</span>
          <Link
            href="/articles"
            className="text-sm text-gray-600 hover:text-indigo-600 transition-colors"
          >
            Articles
          </Link>
          <Link
            href="/assessments"
            className="text-sm text-gray-600 hover:text-indigo-600 transition-colors"
          >
            Assessments
          </Link>
          <Link
            href="/improvements"
            className="text-sm text-gray-600 hover:text-indigo-600 transition-colors"
          >
            Improvements
          </Link>
          <Link
            href="/costs"
            className="text-sm text-gray-600 hover:text-indigo-600 transition-colors"
          >
            Costs
          </Link>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
