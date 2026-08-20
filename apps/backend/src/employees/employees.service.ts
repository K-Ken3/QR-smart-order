import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './employees.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createEmployee(branchId: string, dto: CreateEmployeeDto) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (existing) {
      throw new ConflictException('An employee with this email already exists');
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
      : null;

    return this.prisma.user.create({
      data: {
        tenantId: branch.tenantId,
        branchId,
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        branchId: true,
        isClockedIn: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async getEmployees(branchId: string) {
    return this.prisma.user.findMany({
      where: { branchId, role: { notIn: ['SUPER_ADMIN', 'BUSINESS_OWNER', 'GUEST'] } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        branchId: true,
        isClockedIn: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            assignedRequests: {
              where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateEmployee(id: string, dto: UpdateEmployeeDto) {
    const employee = await this.prisma.user.findUnique({ where: { id } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.branchId !== undefined && { branchId: dto.branchId }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        branchId: true,
        isClockedIn: true,
        isActive: true,
      },
    });
  }

  async clockIn(employeeId: string) {
    const employee = await this.prisma.user.findUnique({ where: { id: employeeId } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (employee.isClockedIn) {
      throw new UnprocessableEntityException('Employee is already clocked in');
    }

    return this.prisma.user.update({
      where: { id: employeeId },
      data: { isClockedIn: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isClockedIn: true,
      },
    });
  }

  async clockOut(employeeId: string) {
    const employee = await this.prisma.user.findUnique({ where: { id: employeeId } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (!employee.isClockedIn) {
      throw new UnprocessableEntityException('Employee is not clocked in');
    }

    const inProgressCount = await this.prisma.request.count({
      where: {
        assignedToId: employeeId,
        status: 'IN_PROGRESS',
      },
    });

    if (inProgressCount > 0) {
      this.logger.warn(
        `Employee ${employeeId} has ${inProgressCount} in-progress tasks on clock-out. ` +
        `Branch manager should reassign.`,
      );
    }

    const assignedCount = await this.prisma.request.count({
      where: {
        assignedToId: employeeId,
        status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      },
    });

    return this.prisma.user.update({
      where: { id: employeeId },
      data: { isClockedIn: false },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isClockedIn: true,
      },
    }).then((result) => ({
      ...result,
      pendingReassignmentCount: assignedCount,
    }));
  }

  async getEmployeeById(id: string) {
    const employee = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        branchId: true,
        tenantId: true,
        isClockedIn: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            assignedRequests: {
              where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
            },
          },
        },
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }
}
