import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { StarRating } from "@/components/feedback/StarRating";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { FeedbackSummary } from "@/components/feedback/FeedbackSummary";

vi.mock("@/components/i18n-provider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    formatDate: (iso?: string | null) => iso ?? "—",
  }),
}));

describe("StarRating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders five selectable stars", () => {
    render(<StarRating value={0} onChange={() => {}} />);
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  it("selects a star on click", () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("radio")[3]);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("clears selection when clicking the already selected star", () => {
    const onChange = vi.fn();
    render(<StarRating value={4} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("radio")[3]);
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("previews the label while hovering a star", () => {
    render(<StarRating value={0} onChange={() => {}} />);
    fireEvent.mouseEnter(screen.getAllByRole("radio")[4]);
    expect(screen.getByText("feedback.labels.five")).toBeInTheDocument();
  });

  it("supports arrow-key navigation", () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(1);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "End" });
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("ignores interaction when disabled", () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} disabled />);
    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
  });
});

const formProps = {
  rating: 0,
  onRatingChange: () => {},
  comment: "",
  onCommentChange: () => {},
  onSubmit: () => {},
  busy: false,
  error: null as string | null,
  submitLabel: "Submit Feedback",
  busyLabel: "Submitting…",
};

describe("FeedbackForm", () => {
  it("disables submit until a rating is selected", () => {
    render(<FeedbackForm {...formProps} />);
    expect(screen.getByRole("button", { name: "Submit Feedback" })).toBeDisabled();
  });

  it("enables submit once a rating is set", () => {
    render(<FeedbackForm {...formProps} rating={4} />);
    expect(screen.getByRole("button", { name: "Submit Feedback" })).toBeEnabled();
  });

  it("shows the busy label while submitting", () => {
    render(<FeedbackForm {...formProps} rating={5} busy />);
    expect(screen.getByRole("button", { name: "Submitting…" })).toBeDisabled();
  });

  it("renders the error message", () => {
    render(
      <FeedbackForm
        {...formProps}
        error="Unable to submit your feedback. Please try again."
      />
    );
    expect(screen.getByText("Unable to submit your feedback. Please try again.")).toBeInTheDocument();
  });

  it("submits the selected rating and comment", () => {
    const onSubmit = vi.fn();
    render(<FeedbackForm {...formProps} rating={5} comment="Nice tool" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit Feedback" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("FeedbackSummary", () => {
  it("shows rating, comment, thanks and an edit button", () => {
    render(<FeedbackSummary rating={5} comment="Great" onEdit={() => {}} />);
    expect(screen.getByText("feedback.thanks")).toBeInTheDocument();
    expect(screen.getByText(/Great/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "feedback.edit" })).toBeInTheDocument();
  });

  it("calls onEdit when the edit button is clicked", () => {
    const onEdit = vi.fn();
    render(<FeedbackSummary rating={3} comment={null} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "feedback.edit" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("hides the comment block when there is none", () => {
    const { container } = render(<FeedbackSummary rating={2} comment={null} onEdit={() => {}} />);
    expect(container.textContent).not.toContain("“");
  });
});