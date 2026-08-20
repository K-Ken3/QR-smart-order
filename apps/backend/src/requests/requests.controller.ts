import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateRequestDto, AssignRequestDto, UpdateRequestStatusDto, AddRequestNoteDto } from './requests.dto';
import { RequestsService } from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createRequest(@Body() dto: CreateRequestDto) {
    return this.requestsService.createRequest(dto);
  }

  @Public()
  @Get('location/:locationId')
  getRequestsByLocation(@Param('locationId') locationId: string) {
    return this.requestsService.getRequests({ locationId });
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER', 'RECEPTIONIST', 'KITCHEN_STAFF')
  @Get()
  getRequests(
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('serviceType') serviceType?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.requestsService.getRequests({ branchId, status, serviceType, locationId });
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER', 'RECEPTIONIST', 'KITCHEN_STAFF')
  @Get(':id')
  getRequest(@Param('id') id: string) {
    return this.requestsService.getRequestById(id);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER', 'RECEPTIONIST', 'KITCHEN_STAFF')
  @Patch(':id/assign')
  assignRequest(
    @Param('id') id: string,
    @Body() dto: AssignRequestDto,
  ) {
    return this.requestsService.assignRequest(id, dto);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER', 'RECEPTIONIST', 'KITCHEN_STAFF')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRequestStatusDto,
  ) {
    return this.requestsService.updateRequestStatus(id, dto);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER', 'RECEPTIONIST', 'KITCHEN_STAFF')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  cancelRequest(@Param('id') id: string) {
    return this.requestsService.cancelRequest(id);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER', 'RECEPTIONIST', 'KITCHEN_STAFF')
  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @Body() dto: AddRequestNoteDto,
  ) {
    return this.requestsService.addRequestNote(id, dto);
  }
}
