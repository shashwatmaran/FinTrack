import { Logo } from "@/components/brand/logo";

const TAGS = [
  { label: "Real-time splits", className: "bg-white" },
  { label: "Smart settle-up", className: "bg-ft-yellow" },
  { label: "AI budgets", className: "bg-ft-pink" },
];

export function BrandPanel() {
  return (
    <div className="relative flex flex-none overflow-hidden border-ft-ink bg-ft-lime px-8 py-10 max-lg:border-b-[3px] lg:w-[44%] lg:flex-col lg:border-r-[3px] lg:px-13 lg:py-12">
      <div className="relative z-2">
        <Logo />
      </div>
      <div className="relative z-2 my-auto max-lg:hidden">
        <h1 className="text-[44px] leading-[1.05] font-bold tracking-[-1.5px] text-balance">
          Split bills without the awkward math.
        </h1>
        <p className="mt-4.5 max-w-[400px] text-[16.5px] leading-[1.5] font-medium">
          Track shared expenses, settle up in a tap, and keep every group square — minus the
          spreadsheet.
        </p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          {TAGS.map((tag) => (
            <span
              key={tag.label}
              className={`rounded-[20px] border-2 border-ft-ink px-[15px] py-[7px] text-[13px] font-bold shadow-neo-xs ${tag.className}`}
            >
              {tag.label}
            </span>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute -right-15 -bottom-[70px] h-[300px] w-[300px] rounded-full border-[3px] border-ft-ink opacity-25" />
      <div className="pointer-events-none absolute right-15 bottom-30 h-35 w-35 rotate-12 rounded-[22px] border-[3px] border-ft-ink bg-ft-sky opacity-50 max-lg:hidden" />
    </div>
  );
}
