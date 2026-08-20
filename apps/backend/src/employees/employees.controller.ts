import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateEmployeeDto, UpdateEmployeeDto } from './employees.dto';
import { EmployeesService } from './employees.service';

@Controller()
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Post('branches/:branchId/employees')
  @HttpCode(HttpStatus.CREATED)
  createEmployee(
    @Param('branchId') branchId: string,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService.createEmployee(branchId, dto);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Get('branches/:branchId/employees')
  getEmployees(@Param('branchId') branchId: string) {
    return this.employeesService.getEmployees(branchId);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Get('employees/:id')
  getEmployee(@Param('id') id: string) {
    return this.employeesService.getEmployeeById(id);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Patch('employees/:id')
  updateEmployee(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.updateEmployee(id, dto);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER', 'RECEPTIONIST', 'KITCHEN_STAFF', 'EMPLOYEE')
  @Post('employees/:id/clock-in')
  @HttpCode(HttpStatus.OK)
  clockIn(@Param('id') id: string) {
    return this.employeesService.clockIn(id);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER', 'RECEPTIONIST', 'KITCHEN_STAFF', 'EMPLOYEE')
  @Post('employees/:id/clock-out')
  @HttpCode(HttpStatus.OK)
  clockOut(@Param('id') id: string) {
    return this.employeesService.clockOut(id);
  }
}
