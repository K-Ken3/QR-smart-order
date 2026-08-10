export interface CreateFeedbackDto {
    requestId: string;
    rating: number;
    comment?: string;
}
export interface FeedbackDto {
    id: string;
    requestId: string;
    locationId: string;
    branchId: string;
    employeeId: string | null;
    rating: number;
    comment: string | null;
    isReviewed: boolean;
    reviewNote: string | null;
    createdAt: Date;
}
export interface ReviewFeedbackDto {
    reviewNote: string;
}
//# sourceMappingURL=feedback.dto.d.ts.map