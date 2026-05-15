import Link from "next/link";
import { cn } from "@/lib/cn";

type EntityLinkProps = {
  id: number;
  children: React.ReactNode;
  className?: string;
  isNewTab?: boolean;
};

const linkClass =
  "font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 rounded-sm";

export function ApartmentLink({
  id,
  children,
  className,
  isNewTab = false,
}: EntityLinkProps) {
  return (
    <Link
      href={`/apartments/${id}`}
      className={cn(linkClass, className)}
      target={isNewTab ? "_blank" : undefined}
      rel={isNewTab ? "noreferrer" : undefined}
    >
      {children}
    </Link>
  );
}

export function ResidentLink({
  id,
  children,
  className,
  isNewTab = false,
}: EntityLinkProps) {
  return (
    <Link
      href={`/renters/${id}`}
      className={cn(linkClass, className)}
      target={isNewTab ? "_blank" : undefined}
      rel={isNewTab ? "noreferrer" : undefined}
    >
      {children}
    </Link>
  );
}
