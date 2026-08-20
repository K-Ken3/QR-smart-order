import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface SubmitFeedbackDto {
  requestId: string;
  rating: number;
  comment?: string;
}

export interface ReviewFeedbackDto {
  reviewNote: string;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async submitFeedback(dto: SubmitFeedbackDto) {
    const request = await this.prisma.request.findUnique({
      where: { id: dto.requestId },
      include: { feedback: true },
    });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.status !== 'COMPLETED') {
      throw new UnprocessableEntityException('Feedback can only be submitted for completed requests');
    }
    if (request.feedback) {
      throw new ConflictException('Feedback has already been submitted for this request');
    }
    if (dto.rating < 1 || dto.rating > 5) {
      throw new UnprocessableEntityException('Rating must be between 1 and 5');
    }

    const feedback = await this.prisma.feedback.create({
      data: {
        requestId: dto.requestId,
        locationId: request.locationId,
        branchId: request.branchId,
        employeeId: request.assignedToId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });

    if (dto.rating <= 2) {
      this.logger.warn(`Low satisfaction rating (${dto.rating}) for request ${dto.requestId}`);
      await this.redis.publish('events:feedback:low_satisfaction', {
        event: 'feedback:low_satisfaction',
        feedbackId: feedback.id,
        requestId: dto.requestId,
        rating: dto.rating,
        branchId: request.branchId,
        tenantId: request.tenantId,
      }).catch((err: Error) => {
        this.logger.warn(`Failed to publish low satisfaction event: ${err.message}`);
      });
    }

    return feedback;
  }

  async getFeedbackByRequestId(requestId: string) {
    const feedback = await this.prisma.feedback.findUnique({
      where: { requestId },
    });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }
    return feedback;
  }

  async reviewFeedback(id: string, dto: ReviewFeedbackDto) {
    const feedback = await this.prisma.feedback.findUnique({ where: { id } });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    return this.prisma.feedback.update({
      where: { id },
      data: {
        isReviewed: true,
        reviewNote: dto.reviewNote,
      },
    });
  }

  async getBranchFeedback(branchId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [feedbacks, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { branchId },
        include: {
          request: { select: { id: true, serviceType: true, createdAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.feedback.count({ where: { branchId } }),
    ]);

    return {
      data: feedbacks,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
