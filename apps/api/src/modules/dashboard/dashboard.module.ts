import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { QuotaService } from '../billing/quota.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [DashboardController],
  providers: [QuotaService, PrismaService],
})
export class DashboardModule {}
