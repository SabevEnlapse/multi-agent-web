import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

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
    <Card className="overflow-hidden hover:shadow-md transition-shadow h-full flex flex-col">
      {news.image && (
        <div className="relative w-full h-48 shrink-0">
           {/* Using a standard img tag for external images to avoid Next.js config for domains */}
           {/* eslint-disable-next-line @next/next/no-img-element */}
           <img 
             src={news.image} 
             alt={news.title}
             className="w-full h-full object-cover"
           />
        </div>
      )}
      <CardHeader className="pb-2">
        <CardTitle className="text-lg leading-tight">
            <a href={news.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {news.title}
            </a>
        </CardTitle>
        {(news.source || news.date) && (
            <div className="text-xs text-muted-foreground flex gap-2">
                {news.source && <span className="font-medium">{news.source}</span>}
                {news.date && <span>{news.date}</span>}
            </div>
        )}
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="text-sm text-muted-foreground line-clamp-3">
          {news.summary}
        </p>
      </CardContent>
      <CardFooter className="pt-0">
        <a 
          href={news.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-sm font-medium text-primary flex items-center gap-1 hover:underline"
        >
          Read more <ExternalLink className="h-3 w-3" />
        </a>
      </CardFooter>
    </Card>
  );
}
