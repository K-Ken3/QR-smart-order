import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateBranchDto, UpdateBranchDto } from './branches.dto';
import { BranchesService } from './branches.service';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Roles('BUSINESS_OWNER')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createBranch(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateBranchDto,
  ) {
    return this.branchesService.createBranch(user.tenantId, dto);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Get()
  getBranches(@CurrentUser() user: RequestUser) {
    return this.branchesService.getBranches(user.tenantId);
  }

  @Roles('BUSINESS_OWNER')
  @Patch(':id')
  updateBranch(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchesService.updateBranch(id, dto);
  }

  @Roles('BUSINESS_OWNER')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deactivateBranch(@Param('id') id: string) {
    return this.branchesService.deactivateBranch(id);
  }
}
