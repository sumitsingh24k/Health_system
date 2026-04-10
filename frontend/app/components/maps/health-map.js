import dynamic from "next/dynamic";

const HealthMapClient = dynamic(() => import("./health-map-client"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] w-full items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500 md:h-[460px]">
      Loading map...
    </div>
  ),
});

export default function HealthMap(props) {
  return <HealthMapClient {...props} />;
}
