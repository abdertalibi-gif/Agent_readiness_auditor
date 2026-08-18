import { Badge } from "@/components/ui/badge";

export function PageHero({
  badge,
  title,
  description,
}: {
  badge?: string;
  title: string;
  description?: string;
}) {
  return (
    <section className="border-b bg-gradient-to-b from-primary/[0.06] to-background">
      <div className="container py-16 text-center">
        {badge && <Badge variant="secondary" className="mb-5">{badge}</Badge>}
        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{description}</p>
        )}
      </div>
    </section>
  );
}
