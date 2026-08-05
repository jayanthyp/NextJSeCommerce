import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

type Review = {
  id: string
  product_id: string
  customer_name: string | null
  rating: number
  title: string | null
  content: string
  status: "pending" | "approved" | "rejected"
  created_at: string
}

const STATUS_COLOR: Record<Review["status"], "orange" | "green" | "red"> = {
  pending: "orange",
  approved: "green",
  rejected: "red",
}

const ReviewsAdminPage = () => {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("pending")

  const fetchReviews = async (status: string) => {
    setLoading(true)
    try {
      const query = status ? `?status=${status}` : ""
      const res = await fetch(`/admin/reviews${query}`, { credentials: "include" })
      const data = await res.json()
      setReviews(data.reviews ?? [])
    } catch {
      toast.error("Failed to load reviews")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReviews(filter)
  }, [filter])

  const setStatus = async (review: Review, status: Review["status"]) => {
    try {
      const res = await fetch(`/admin/reviews/${review.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Review ${status}`)
      fetchReviews(filter)
    } catch {
      toast.error("Failed to update review")
    }
  }

  const handleDelete = async (review: Review) => {
    if (!confirm("Delete this review permanently?")) return
    try {
      const res = await fetch(`/admin/reviews/${review.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error()
      toast.success("Review deleted")
      fetchReviews(filter)
    } catch {
      toast.error("Failed to delete review")
    }
  }

  return (
    <Container className="p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Reviews</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            Product reviews are hidden from the storefront until approved.
          </Text>
        </div>
        <div className="flex gap-x-2">
          {(["pending", "approved", "rejected", ""] as const).map((s) => (
            <Button
              key={s || "all"}
              variant={filter === s ? "primary" : "secondary"}
              size="small"
              onClick={() => setFilter(s)}
            >
              {s || "All"}
            </Button>
          ))}
        </div>
      </div>

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Product</Table.HeaderCell>
            <Table.HeaderCell>Customer</Table.HeaderCell>
            <Table.HeaderCell>Rating</Table.HeaderCell>
            <Table.HeaderCell>Review</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell></Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {!loading && reviews.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan={6}>
                <Text className="text-ui-fg-subtle">No reviews here.</Text>
              </Table.Cell>
            </Table.Row>
          )}
          {reviews.map((review) => (
            <Table.Row key={review.id}>
              <Table.Cell className="font-mono text-xs">{review.product_id}</Table.Cell>
              <Table.Cell>{review.customer_name ?? "Anonymous"}</Table.Cell>
              <Table.Cell>{"★".repeat(review.rating)}</Table.Cell>
              <Table.Cell className="max-w-xs">
                {review.title && <div className="font-medium">{review.title}</div>}
                <div className="text-ui-fg-subtle truncate">{review.content}</div>
              </Table.Cell>
              <Table.Cell>
                <Badge color={STATUS_COLOR[review.status]}>{review.status}</Badge>
              </Table.Cell>
              <Table.Cell>
                <div className="flex gap-x-2 justify-end">
                  {review.status !== "approved" && (
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setStatus(review, "approved")}
                    >
                      Approve
                    </Button>
                  )}
                  {review.status !== "rejected" && (
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setStatus(review, "rejected")}
                    >
                      Reject
                    </Button>
                  )}
                  <Button variant="danger" size="small" onClick={() => handleDelete(review)}>
                    Delete
                  </Button>
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Reviews",
})

export default ReviewsAdminPage
