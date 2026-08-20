import { Body, Controller, Get, Param, Patch, Post, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { FeedbackService, SubmitFeedbackDto, ReviewFeedbackDto } from './feedback.service';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  submitFeedback(@Body() dto: SubmitFeedbackDto) {
    return this.feedbackService.submitFeedback(dto);
  }

  @Get('requests/:requestId')
  getByRequestId(@Param('requestId') requestId: string) {
    return this.feedbackService.getFeedbackByRequestId(requestId);
  }

  @Patch(':id/review')
  reviewFeedback(
    @Param('id') id: string,
    @Body() dto: ReviewFeedbackDto,
  ) {
    return this.feedbackService.reviewFeedback(id, dto);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Get('branch/:branchId')
  getBranchFeedback(
    @Param('branchId') branchId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.feedbackService.getBranchFeedback(
      branchId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
