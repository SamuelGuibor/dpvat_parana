"use client"

import * as React from "react"
import { Badge } from "@/app/_components/ui/badge"
import { ScrollArea } from "@/app/_components/ui/scroll-area"
import { cn } from "@/app/_lib/utils"

export interface Review {
  rating: number
  reviewer: string
  roleReviewer: string
  review: string
  date: string
}

export interface ClientReviewsProps
  extends React.HTMLAttributes<HTMLDivElement> {
  reviews: Review[]
}

const fillStars = (rating: number) => {
  const stars = []
  const fullStars = Math.floor(rating)
  const hasHalfStar = rating % 1 >= 0.5

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(
        <svg
          key={i}
          className="h-4 w-4 fill-primary"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27Z" />
        </svg>
      )
    } else if (i === fullStars && hasHalfStar) {
      stars.push(
        <svg
          key={i}
          className="h-4 w-4"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="half-fill" x1="0" x2="1" y1="0" y2="0">
              <stop offset="50%" className="stop-color-primary" />
              <stop offset="50%" className="stop-color-muted" />
            </linearGradient>
          </defs>
          <path
            fill="url(#half-fill)"
            d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27Z"
          />
        </svg>
      )
    } else {
      stars.push(
        <svg
          key={i}
          className="h-4 w-4 fill-muted"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27Z" />
        </svg>
      )
    }
  }

  return stars
}

const ClientReviews = React.forwardRef<HTMLDivElement, ClientReviewsProps>(
  ({ reviews = [], className, ...props }, ref) => {
    const totalRating = React.useMemo((): number => {
      if (reviews.length === 0) return 0
      const totalRatings = reviews.map((review) => review.rating)
      const ratingFixed = totalRatings.map(
        (rating) => Math.round(rating * 10) / 10
      )
      const totalRating =
        ratingFixed.reduce((acc, rating) => acc + rating, 0) / totalRatings.length
      return Math.round(totalRating * 10) / 10
    }, [reviews])

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border border-border bg-background py-4 px-3 pl-4 w-[90%] sm:w-[70%] mx-auto",
          className
        )}
        {...props}
      >
        <div className="flex items-baseline justify-between text-lg font-semibold">
          <h3 className="mb-4">Avaliações Google <hr /> ( 946 Avaliações ) </h3>
          <div className="flex items-center gap-2 pr-4">
            <span>{totalRating}</span>
            <span className="relative flex items-center gap-1 text-foreground/80">
              {fillStars(totalRating)}
            </span>
          </div>
        </div>

        <ScrollArea className="h-[320px] pr-4">
          <div className="space-y-2">
            {reviews.map((review) => (
              <article
                key={review.reviewer}
                className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-semibold">{review.reviewer}</p>
                  <Badge variant="secondary">{review.rating}</Badge>
                </div>
                <p className="text-balance text-sm text-foreground/80">
                  {review.review}
                </p>
                <div className="flex items-center justify-between">
                  <small className="text-foreground/60">
                    {review.reviewer}, {review.roleReviewer}
                  </small>
                  <small className="text-foreground/60">{review.date}</small>
                </div>
              </article>
            ))}
          </div>
        </ScrollArea>
      </div>
    )
  }
)

ClientReviews.displayName = "ClientReviews"

export { ClientReviews }