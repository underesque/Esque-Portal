import Image from "next/image";
import clsx from "clsx";

export function Logo({ boxed = true, className }: { boxed?: boolean; className?: string }) {
  const image = (
    <Image
      src="/logo.jpg"
      alt="ESQUE"
      width={660}
      height={380}
      priority
      className="h-full w-auto object-contain"
    />
  );

  if (!boxed) {
    return <div className={className}>{image}</div>;
  }

  return (
    <div
      className={clsx(
        "inline-flex items-center rounded-xl bg-white/85 backdrop-blur-md ring-1 ring-white/40 px-3 py-2",
        className
      )}
    >
      {image}
    </div>
  );
}
