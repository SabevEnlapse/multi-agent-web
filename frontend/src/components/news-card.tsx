import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

/**
 * News Card Component
 *
 * Displays a single news article or search result.
 * - Shows title, summary, source, and date.
 * - Includes an image if available.
 * - Links to the original article.
 */

interface NewsItem {
  title: string;
  url: string;
  summary?: string;
  image?: string;
  source?: string;
  date?: string;
}

interface NewsCardProps {
  news: NewsItem;
}

export function NewsCard({ news }: NewsCardProps) {
  return (
    <Card className="group flex h-full flex-col overflow-hidden rounded-xl border border-border/40 bg-card transition-all duration-300 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5">
      {news.image && (
        <div className="relative h-48 w-full shrink-0 overflow-hidden bg-muted/20">
          {/* Using a standard img tag for external images to avoid Next.js config for domains */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={news.image}
            alt={news.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        </div>
      )}
      <CardHeader className="flex-1 space-y-2 p-4">
        {(news.source || news.date) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {news.source && (
              <span className="font-medium text-primary/80">{news.source}</span>
            )}
            {news.source && news.date && <span className="text-border">•</span>}
            {news.date && <span>{news.date}</span>}
          </div>
        )}
        <CardTitle className="line-clamp-2 text-base font-semibold leading-tight tracking-tight group-hover:text-primary transition-colors">
          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            className="focus:outline-none"
          >
            {news.title}
          </a>
        </CardTitle>
        <p className="line-clamp-3 text-sm text-muted-foreground/90">
          {news.summary}
        </p>
      </CardHeader>
      <CardFooter className="p-4 pt-0">
        <a
          href={news.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          Read full article <ExternalLink className="h-3 w-3" />
        </a>
      </CardFooter>
    </Card>
  );
}

