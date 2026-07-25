import { BrandPanel } from "@/components/auth/brand-panel";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-ft-bg lg:flex-row">
      <BrandPanel />
      <div className="ft-scroll flex flex-1 items-center justify-center overflow-auto px-8 py-10">
        <div className="w-full max-w-[400px] animate-ft-slide">{children}</div>
      </div>
    </div>
  );
}
