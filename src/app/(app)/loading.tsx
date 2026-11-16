export default function Loading() {
  return (
    <div className="animate-pulse" role="status" aria-label="در حال بارگذاری">
      <div className="mb-6 h-8 w-64 rounded bg-line" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg bg-line/70" />)}</div>
      <div className="mt-4 h-72 rounded-lg bg-line/50" />
    </div>
  );
}
